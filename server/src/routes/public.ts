/**
 * Public, unauthenticated endpoints used by publisher websites:
 *   GET  /embed?publicKey=&slot=&format=html|json   → active creative (HTML document or JSON)
 *   GET  /e/:publicKey.js                           → JavaScript embed loader
 *   GET  /click?mediaId=&slotId=&creativeId=         → records a click and redirects
 *   POST /impression                                 → records an impression (beacon)
 *   POST /api/rss-webhook                            → external RSS → monitoring
 * Ported from the former Supabase Edge Functions.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { asyncHandler, nowIso, getClientIp, escapeHtml, optionalString, HttpError } from '../utils.js';
import { lookupGeo } from '../services/geo.js';
import { processArticle } from '../services/monitoring.js';
import { fetchWithTimeout } from '../services/newsVerifier.js';
import { requireAuth } from '../auth.js';

export const publicRouter = Router();

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

publicRouter.use((req, res, next) => {
  res.set(CORS);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

interface CreativeRow {
  id: string; type: string; src: string | null; src2: string | null; html: string | null; click_url: string | null; status: string;
}
interface AssignmentRow {
  id: string; creative_id: string | null; weight: number; start_at: string | null; end_at: string | null;
}

const insertMetric = db.prepare(
  `INSERT INTO metrics (media_id, slot_id, creative_id, type, user_agent, ip, referrer, country, city, region, language, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

async function recordMetric(
  req: import('express').Request,
  type: 'IMPRESSION' | 'CLICK',
  ids: { mediaId: string; slotId: string; creativeId: string },
  referrer: string
) {
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = (req.headers['accept-language'] as string) || '';
  const language = acceptLanguage.split(',')[0].split('-')[0] || null;
  const geo = await lookupGeo(ip);
  insertMetric.run(ids.mediaId, ids.slotId, ids.creativeId, type, userAgent, ip, referrer, geo.country, geo.city, geo.region, language, nowIso());
}

/** Weighted random choice among assignments valid right now. Expired ones are auto-deactivated. */
function pickAssignment(slotId: string): { assignment: AssignmentRow; creative: CreativeRow } | null {
  const rows = db
    .prepare(
      `SELECT a.id, a.creative_id, a.weight, a.start_at, a.end_at
       FROM assignments a JOIN creatives c ON c.id = a.creative_id
       WHERE a.slot_id = ? AND a.is_active = 1 AND c.status = 'ACTIVE'`
    )
    .all(slotId) as AssignmentRow[];

  const now = Date.now();
  const valid: AssignmentRow[] = [];
  for (const a of rows) {
    if (a.start_at && now < new Date(a.start_at).getTime()) continue;
    if (a.end_at && now > new Date(a.end_at).getTime()) {
      db.prepare('UPDATE assignments SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), a.id);
      continue;
    }
    valid.push(a);
  }
  if (valid.length === 0) return null;

  const total = valid.reduce((s, a) => s + Math.max(1, a.weight || 1), 0);
  let r = Math.random() * total;
  let chosen = valid[valid.length - 1];
  for (const a of valid) {
    r -= Math.max(1, a.weight || 1);
    if (r <= 0) {
      chosen = a;
      break;
    }
  }
  const creative = db.prepare('SELECT id, type, src, src2, html, click_url, status FROM creatives WHERE id = ?').get(chosen.creative_id) as CreativeRow;
  return { assignment: chosen, creative };
}

function domainAllowed(domains: string[], referrer: string): boolean {
  if (!domains || domains.length === 0 || !referrer) return true;
  let host = '';
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return true;
  }
  // The admin panel (served from this same server) must always be able to preview ads
  let ownHost = '';
  try {
    ownHost = new URL(config.publicUrl).hostname.toLowerCase();
  } catch {
    ownHost = '';
  }
  if (host === ownHost || host === 'localhost' || host === '127.0.0.1') return true;
  return domains.some((d) => {
    const dom = d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return host === dom || host.endsWith(`.${dom}`);
  });
}

function renderEmbedHtml(creative: CreativeRow, clickUrl: string): string {
  const body =
    creative.type === 'HTML' && creative.html
      ? `<div onclick="window.open(${JSON.stringify(clickUrl)}, '_blank')" style="cursor:pointer;width:100%;height:100%;">${creative.html}</div>`
      : creative.type === 'VIDEO'
        ? `<a href="${escapeHtml(clickUrl)}" target="_blank" rel="noopener noreferrer">
    <video autoplay muted loop playsinline>
      ${creative.src ? `<source src="${escapeHtml(creative.src)}" type="video/mp4">` : ''}
      ${creative.src2 ? `<source src="${escapeHtml(creative.src2)}" type="video/webm">` : ''}
    </video></a>`
        : `<a href="${escapeHtml(clickUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(creative.src || '')}" alt="Ad" /></a>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body { display: flex; align-items: center; justify-content: center; }
    a { display: block; width: 100%; height: 100%; }
    img, video { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain; display: block; cursor: pointer; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

publicRouter.get(
  '/embed',
  asyncHandler(async (req, res) => {
    const publicKey = optionalString(req.query.publicKey);
    const slotSlug = optionalString(req.query.slot);
    const format = req.query.format === 'html' ? 'html' : 'json';
    res.set('Cache-Control', 'no-store');

    const fail = (status: number, message: string, html: string) =>
      format === 'html' ? res.status(200).type('html').send(`<div>${html}</div>`) : res.status(status).json({ error: message });

    if (!publicKey || !slotSlug) return fail(400, 'Missing publicKey or slot parameter', 'Missing parameters');

    const media = db.prepare('SELECT id, status, domains FROM media WHERE public_key = ?').get(publicKey) as
      | { id: string; status: string; domains: string }
      | undefined;
    if (!media) return fail(404, 'Media not found', 'No media found');
    if (media.status !== 'ACTIVE') return fail(404, 'Media paused', 'Media paused');

    const referrer = optionalString(req.query.ref) || (req.headers.referer as string) || '';
    let domains: string[] = [];
    try {
      domains = JSON.parse(media.domains || '[]');
    } catch {
      domains = [];
    }
    if (!domainAllowed(domains, referrer)) return fail(403, 'Domain not allowed', 'Domain not allowed');

    const slot = db.prepare('SELECT id, width, height, status FROM slots WHERE media_id = ? AND slug = ?').get(media.id, slotSlug) as
      | { id: string; width: number | null; height: number | null; status: string }
      | undefined;
    if (!slot) return fail(404, 'Slot not found', 'Slot not found');
    if (slot.status !== 'ACTIVE') return fail(404, 'Slot paused', 'No active campaigns');

    const picked = pickAssignment(slot.id);
    if (!picked) return fail(404, 'No assignments in valid schedule', 'No active campaigns');
    const { creative } = picked;

    // The HTML format renders directly, so the impression is recorded here.
    // The JSON format is consumed by the JS loader, which sends its own beacon.
    if (format === 'html') {
      recordMetric(req, 'IMPRESSION', { mediaId: media.id, slotId: slot.id, creativeId: creative.id }, referrer).catch((e) =>
        console.error('impression error', e)
      );
      const clickUrl = `${config.publicUrl}/click?mediaId=${media.id}&slotId=${slot.id}&creativeId=${creative.id}`;
      return res.status(200).type('html').send(renderEmbedHtml(creative, clickUrl));
    }

    res.json({
      mediaId: media.id,
      slotId: slot.id,
      creativeId: creative.id,
      type: creative.type,
      src: creative.src,
      src2: creative.src2,
      html: creative.html,
      clickUrl: creative.click_url,
      width: slot.width,
      height: slot.height,
    });
  })
);

publicRouter.get('/e/:publicKey', (req, res) => {
  const publicKey = req.params.publicKey.replace(/\.js$/, '');
  if (!publicKey) return res.status(400).type('application/javascript').send('// Missing public key');

  const base = config.publicUrl;
  const js = `
(function() {
  'use strict';
  var scripts = document.querySelectorAll('script[src*="/e/${publicKey}.js"]');
  var currentScript = scripts[scripts.length - 1];
  if (!currentScript) { console.error('SIGMOCAD: script tag not found'); return; }

  var slotSlug = currentScript.getAttribute('data-slot');
  var width = currentScript.getAttribute('data-width') || '300';
  var height = currentScript.getAttribute('data-height') || '250';
  if (!slotSlug) { console.error('SIGMOCAD: missing data-slot attribute'); return; }

  var containerId = 'gev-' + slotSlug;
  var container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    currentScript.parentNode.insertBefore(container, currentScript);
  }

  var referrer = encodeURIComponent(document.referrer || window.location.href);
  var embedApiUrl = '${base}/embed?publicKey=${publicKey}&slot=' + encodeURIComponent(slotSlug) + '&ref=' + referrer;

  fetch(embedApiUrl)
    .then(function(r) { return (r.status === 204 || !r.ok) ? null : r.json(); })
    .then(function(data) {
      if (!data) return;
      var clickDestUrl = '${base}/click?mediaId=' + data.mediaId + '&slotId=' + data.slotId + '&creativeId=' + data.creativeId;

      try {
        navigator.sendBeacon('${base}/impression', new Blob([JSON.stringify({
          mediaId: data.mediaId, slotId: data.slotId, creativeId: data.creativeId,
          referrer: document.referrer || window.location.href
        })], { type: 'application/json' }));
      } catch (e) {}

      container.style.cssText = 'display:inline-block;position:relative;width:' + width + 'px;height:' + height + 'px;overflow:hidden;';

      if (data.type === 'IMAGE' || data.type === 'GIF') {
        var link = document.createElement('a');
        link.href = clickDestUrl; link.target = '_blank'; link.rel = 'noopener nofollow';
        link.style.cssText = 'display:block;width:100%;height:100%;';
        var img = document.createElement('img');
        img.src = data.src; img.alt = 'Ad';
        img.style.cssText = 'max-width:100%;max-height:100%;width:auto;height:auto;display:block;margin:auto;';
        link.appendChild(img); container.appendChild(link);
      } else if (data.type === 'VIDEO') {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:100%;height:100%;';
        var video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.loop = true; video.playsInline = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
        if (data.src) { var s1 = document.createElement('source'); s1.src = data.src; s1.type = 'video/mp4'; video.appendChild(s1); }
        if (data.src2) { var s2 = document.createElement('source'); s2.src = data.src2; s2.type = 'video/webm'; video.appendChild(s2); }
        var overlay = document.createElement('a');
        overlay.href = clickDestUrl; overlay.target = '_blank'; overlay.rel = 'noopener nofollow';
        overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;cursor:pointer;';
        wrap.appendChild(video); wrap.appendChild(overlay); container.appendChild(wrap);
      } else if (data.type === 'HTML' && data.html) {
        var htmlWrap = document.createElement('div');
        htmlWrap.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        htmlWrap.innerHTML = data.html
          .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '')
          .replace(/on\\w+\\s*=\\s*["'][^"']*["']/gi, '');
        container.appendChild(htmlWrap);
        if (data.clickUrl) {
          var ov = document.createElement('a');
          ov.href = clickDestUrl; ov.target = '_blank'; ov.rel = 'noopener nofollow';
          ov.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1000;';
          container.appendChild(ov);
        }
      }
    })
    .catch(function(err) { console.error('SIGMOCAD: failed to load creative', err); });
})();
`;
  res.set('Cache-Control', 'public, max-age=300').type('application/javascript').send(js);
});

publicRouter.get(
  '/click',
  asyncHandler(async (req, res) => {
    const mediaId = optionalString(req.query.mediaId);
    const slotId = optionalString(req.query.slotId);
    const creativeId = optionalString(req.query.creativeId);
    if (!mediaId || !slotId || !creativeId) return res.status(400).send('Missing parameters');

    const creative = db.prepare('SELECT click_url FROM creatives WHERE id = ?').get(creativeId) as { click_url: string | null } | undefined;
    await recordMetric(req, 'CLICK', { mediaId, slotId, creativeId }, (req.headers.referer as string) || '');
    res.redirect(302, creative?.click_url || 'about:blank');
  })
);

publicRouter.post(
  '/impression',
  asyncHandler(async (req, res) => {
    // sendBeacon may post text/plain; accept both JSON-parsed bodies and raw strings
    let body: Record<string, unknown> = {};
    if (typeof req.body === 'string') {
      try {
        body = JSON.parse(req.body);
      } catch {
        body = {};
      }
    } else if (req.body && typeof req.body === 'object') {
      body = req.body as Record<string, unknown>;
    }
    const mediaId = optionalString(body.mediaId);
    const slotId = optionalString(body.slotId);
    const creativeId = optionalString(body.creativeId);
    if (!mediaId || !slotId || !creativeId) return res.status(400).json({ error: 'Missing required fields' });

    await recordMetric(req, 'IMPRESSION', { mediaId, slotId, creativeId }, optionalString(body.referrer) || '');
    res.json({ success: true });
  })
);

/** External RSS → monitoring. Optional shared secret via header `x-webhook-secret` or `?secret=`. */
publicRouter.post('/api/rss-webhook', (req, res) => {
  if (config.rss.webhookSecret) {
    const provided = (req.headers['x-webhook-secret'] as string) || optionalString(req.query.secret);
    if (provided !== config.rss.webhookSecret) throw new HttpError(401, 'Invalid webhook secret');
  }
  const b = (req.body || {}) as Record<string, unknown>;
  const title = optionalString(b.title);
  const link = optionalString(b.link) || optionalString(b.url);
  const source = optionalString(b.source);
  if (!title || !link || !source) return res.status(400).json({ error: 'Missing required fields: title, link, source' });

  const results = processArticle({
    title,
    description: optionalString(b.description),
    link,
    source,
    pubDate: optionalString(b.pubDate),
  });
  res.json({ message: results.length ? 'Article processed' : 'No keyword matches found', article_title: title, article_url: link, companies_matched: results.length, results });
});

// ----- Authenticated tools ------------------------------------------------

export const toolsRouter = Router();
toolsRouter.use(requireAuth);

/** POST /api/tools/validate-url { url } → reachability check (HEAD, falls back to GET). */
toolsRouter.post(
  '/validate-url',
  asyncHandler(async (req, res) => {
    const url = optionalString(req.body?.url);
    if (!url) return res.status(400).json({ error: 'URL is required', isValid: false });
    try {
      new URL(url);
    } catch {
      return res.json({ error: 'Invalid URL format', isValid: false });
    }
    let response = await fetchWithTimeout(url, 10000, 'HEAD');
    if (!response || response.status === 405 || response.status === 403) response = await fetchWithTimeout(url, 10000, 'GET');
    if (!response) return res.json({ isValid: false, error: 'Connection failed', url });
    res.json({
      isValid: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      url,
    });
  })
);

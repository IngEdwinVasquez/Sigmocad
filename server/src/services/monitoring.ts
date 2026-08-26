import Parser from 'rss-parser';
import { db } from '../db.js';
import { config } from '../config.js';
import { uuid, nowIso, toJson } from '../utils.js';
import { analyzeSentiment } from './sentiment.js';

export interface IncomingArticle {
  title: string;
  description?: string | null;
  link: string;
  source: string;
  pubDate?: string | null;
}

export interface ProcessResult {
  company_id: string;
  matched_keywords: string[];
  status: 'saved' | 'duplicate' | 'error';
  error?: string;
}

interface KeywordRow {
  id: string;
  company_id: string;
  keyword: string;
}

const insertArticle = db.prepare(
  `INSERT INTO monitored_articles
     (id, company_id, title, description, url, source, published_at, discovered_at, matched_keywords,
      sentiment, sentiment_score, sentiment_auto, platform, read_status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)`
);

const needleFor = (keyword: string) => keyword.trim().replace(/^"|"$/g, '').toLowerCase();

/**
 * Match an article against active keywords and store it for every company with a match.
 * If `onlyCompanyId` is given, only that company's keywords are considered.
 */
export function processArticle(article: IncomingArticle, onlyCompanyId: string | null = null): ProcessResult[] {
  const keywords = (
    onlyCompanyId
      ? db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1 AND company_id = ?').all(onlyCompanyId)
      : db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1').all()
  ) as KeywordRow[];

  if (keywords.length === 0) return [];

  const content = `${article.title.toLowerCase()} ${(article.description || '').toLowerCase()}`;
  const matches = new Map<string, string[]>();

  for (const kw of keywords) {
    const needle = needleFor(kw.keyword);
    if (needle && content.includes(needle)) {
      if (!matches.has(kw.company_id)) matches.set(kw.company_id, []);
      matches.get(kw.company_id)!.push(kw.keyword);
    }
  }

  if (matches.size === 0) return [];

  const sentiment = analyzeSentiment(`${article.title} ${article.description || ''}`);
  const results: ProcessResult[] = [];
  for (const [companyId, matched] of matches.entries()) {
    try {
      insertArticle.run(
        uuid(),
        companyId,
        article.title,
        article.description || null,
        article.link,
        article.source,
        article.pubDate ? new Date(article.pubDate).toISOString() : nowIso(),
        nowIso(),
        toJson(matched),
        sentiment.label,
        sentiment.score,
        'RSS'
      );
      results.push({ company_id: companyId, matched_keywords: matched, status: 'saved' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE')) {
        results.push({ company_id: companyId, matched_keywords: matched, status: 'duplicate' });
      } else {
        results.push({ company_id: companyId, matched_keywords: matched, status: 'error', error: message });
      }
    }
  }
  return results;
}

/** One-time backfill: computes sentiment for rows saved before the analyzer existed. */
export function backfillSentiment(): number {
  const pending = db.prepare('SELECT id, title, description FROM monitored_articles WHERE sentiment IS NULL').all() as {
    id: string; title: string; description: string | null;
  }[];
  if (pending.length === 0) return 0;
  const update = db.prepare('UPDATE monitored_articles SET sentiment = ?, sentiment_score = ?, sentiment_auto = 1 WHERE id = ?');
  const run = db.transaction(() => {
    for (const row of pending) {
      const s = analyzeSentiment(`${row.title} ${row.description || ''}`);
      update.run(s.label, s.score, row.id);
    }
  });
  run();
  return pending.length;
}

interface FeedRow {
  id: string;
  company_id: string | null;
  name: string;
  url: string;
}

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'SIGMOCAD-RSS/1.0' } });

export async function fetchFeed(feed: FeedRow): Promise<{ processed: number; saved: number }> {
  let processed = 0;
  let saved = 0;
  try {
    const parsed = await parser.parseURL(feed.url);
    const sourceName = feed.name || parsed.title || feed.url;
    for (const item of parsed.items || []) {
      if (!item.title || !item.link) continue;
      processed++;
      const results = processArticle(
        {
          title: item.title,
          description: item.contentSnippet || item.content || item.summary || null,
          link: item.link,
          source: sourceName,
          pubDate: item.isoDate || item.pubDate || null,
        },
        feed.company_id
      );
      saved += results.filter((r) => r.status === 'saved').length;
    }
    db.prepare('UPDATE rss_feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?').run(nowIso(), feed.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE rss_feeds SET last_fetched_at = ?, last_error = ? WHERE id = ?').run(nowIso(), message, feed.id);
  }
  return { processed, saved };
}

export async function pollAllFeeds(): Promise<{ feeds: number; processed: number; saved: number }> {
  const feeds = db.prepare('SELECT id, company_id, name, url FROM rss_feeds WHERE is_active = 1').all() as FeedRow[];
  let processed = 0;
  let saved = 0;
  for (const feed of feeds) {
    const r = await fetchFeed(feed);
    processed += r.processed;
    saved += r.saved;
  }
  return { feeds: feeds.length, processed, saved };
}

let rssTimer: NodeJS.Timeout | null = null;
let rssRunning = false;

export function startRssPoller() {
  const minutes = config.rss.pollMinutes;
  if (!minutes || minutes <= 0) return;

  const tick = async () => {
    if (rssRunning) return;
    rssRunning = true;
    try {
      const r = await pollAllFeeds();
      if (r.feeds > 0) console.log(`[rss] ${r.feeds} fuentes, ${r.processed} artículos, ${r.saved} nuevos`);
    } catch (err) {
      console.error('[rss] error en el sondeo:', err);
    } finally {
      rssRunning = false;
    }
  };

  // first run shortly after boot, then on the configured interval
  setTimeout(tick, 10_000).unref();
  rssTimer = setInterval(tick, minutes * 60 * 1000);
  rssTimer.unref();
}

// ---------------------------------------------------------------------------
// Monitoreo de redes sociales: usa las mismas palabras clave activas por empresa.
// Reddit (búsqueda pública, sin clave) siempre disponible; YouTube requiere
// YOUTUBE_API_KEY (capa gratuita de la API de datos de YouTube).
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SocialItem {
  title: string;
  description: string | null;
  link: string;
  source: string;
  pubDate: string | null;
}

const REDDIT_UA = `SIGMOCAD-SocialMonitor/1.0 (+${config.publicUrl})`;

let redditBlockedWarned = false;
export const isRedditLikelyBlocked = () => redditBlockedWarned;

async function searchReddit(query: string): Promise<SocialItem[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=15&type=link`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { headers: { 'User-Agent': REDDIT_UA, Accept: 'application/json' }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      // Reddit's public search commonly returns 403 to datacenter/cloud IPs (Cloudflare bot protection),
      // independent of headers used. Log it once so it doesn't look like "no matches found" forever.
      if (res.status === 403 && !redditBlockedWarned) {
        redditBlockedWarned = true;
        console.warn(
          '[social] Reddit devolvió 403 (bloqueo anti-bots). Es una limitación del lado de Reddit para IPs de servidor/datacenter, ' +
            'no un error de configuración. Considere RSS.app u otra fuente para esa red.'
        );
      }
      return [];
    }
    const data = (await res.json()) as {
      data?: { children?: { data: { title: string; selftext?: string; permalink: string; subreddit: string; created_utc: number } }[] };
    };
    return (data.data?.children || []).map((c) => ({
      title: c.data.title,
      description: c.data.selftext ? c.data.selftext.slice(0, 500) : null,
      link: `https://www.reddit.com${c.data.permalink}`,
      source: `Reddit r/${c.data.subreddit}`,
      pubDate: new Date(c.data.created_utc * 1000).toISOString(),
    }));
  } catch (err) {
    console.error('[social] error consultando Reddit:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function searchYoutube(query: string): Promise<SocialItem[]> {
  if (!config.social.youtubeApiKey) return [];
  try {
    const url =
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=10` +
      `&q=${encodeURIComponent(query)}&key=${config.social.youtubeApiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.error('[social] YouTube respondió', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = (await res.json()) as {
      items?: { id: { videoId?: string }; snippet: { title: string; description: string; channelTitle: string; publishedAt: string } }[];
    };
    return (data.items || [])
      .filter((i) => i.id.videoId)
      .map((i) => ({
        title: i.snippet.title,
        description: i.snippet.description || null,
        link: `https://www.youtube.com/watch?v=${i.id.videoId}`,
        source: `YouTube · ${i.snippet.channelTitle}`,
        pubDate: i.snippet.publishedAt,
      }));
  } catch (err) {
    console.error('[social] error consultando YouTube:', err instanceof Error ? err.message : err);
    return [];
  }
}

function matchedKeywordsForCompany(companyId: string, text: string): string[] {
  const keywords = db.prepare('SELECT keyword FROM monitoring_keywords WHERE is_active = 1 AND company_id = ?').all(companyId) as {
    keyword: string;
  }[];
  const lower = text.toLowerCase();
  return keywords.map((k) => k.keyword).filter((k) => lower.includes(needleFor(k)));
}

const insertSocialMention = db.prepare(
  `INSERT INTO monitored_articles
     (id, company_id, title, description, url, source, published_at, discovered_at, matched_keywords,
      sentiment, sentiment_score, sentiment_auto, platform, read_status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)`
);

function saveSocialMention(companyId: string, item: SocialItem, platform: 'REDDIT' | 'YOUTUBE', triggerKeyword: string): 'saved' | 'duplicate' {
  const matched = matchedKeywordsForCompany(companyId, `${item.title} ${item.description || ''}`);
  if (!matched.includes(triggerKeyword)) matched.push(triggerKeyword);
  const sentiment = analyzeSentiment(`${item.title} ${item.description || ''}`);

  try {
    insertSocialMention.run(
      uuid(), companyId, item.title, item.description, item.link, item.source,
      item.pubDate || nowIso(), nowIso(), toJson(matched), sentiment.label, sentiment.score, platform
    );
    return 'saved';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('UNIQUE')) return 'duplicate';
    throw err;
  }
}

/** Runs one search pass (Reddit + optionally YouTube) for every active keyword. */
export async function pollSocialMentions(onlyCompanyId: string | null = null): Promise<{ reddit: number; youtube: number }> {
  const keywords = (
    onlyCompanyId
      ? db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1 AND company_id = ?').all(onlyCompanyId)
      : db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1').all()
  ) as KeywordRow[];

  let redditSaved = 0;
  let youtubeSaved = 0;

  for (const kw of keywords) {
    const query = needleFor(kw.keyword);
    if (!query) continue;

    if (config.social.redditEnabled) {
      const items = await searchReddit(query);
      for (const item of items) {
        if (saveSocialMention(kw.company_id, item, 'REDDIT', kw.keyword) === 'saved') redditSaved++;
      }
      await sleep(500);
    }

    if (config.social.youtubeEnabled) {
      const items = await searchYoutube(query);
      for (const item of items) {
        if (saveSocialMention(kw.company_id, item, 'YOUTUBE', kw.keyword) === 'saved') youtubeSaved++;
      }
      await sleep(500);
    }
  }

  return { reddit: redditSaved, youtube: youtubeSaved };
}

let socialTimer: NodeJS.Timeout | null = null;
let socialRunning = false;

export function startSocialPoller() {
  if (!config.social.redditEnabled && !config.social.youtubeEnabled) return;
  const minutes = config.social.pollMinutes;
  if (!minutes || minutes <= 0) return;

  const tick = async () => {
    if (socialRunning) return;
    socialRunning = true;
    try {
      const r = await pollSocialMentions();
      if (r.reddit > 0 || r.youtube > 0) console.log(`[social] Reddit: ${r.reddit} nuevas · YouTube: ${r.youtube} nuevas`);
    } catch (err) {
      console.error('[social] error en el sondeo:', err);
    } finally {
      socialRunning = false;
    }
  };

  setTimeout(tick, 20_000).unref();
  socialTimer = setInterval(tick, minutes * 60 * 1000);
  socialTimer.unref();
}

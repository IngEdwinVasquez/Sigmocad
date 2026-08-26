import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql, companyForInsert } from '../auth.js';
import { HttpError, uuid, nowIso, requireString, optionalString, oneOf, toInt, mapRow, mapRows, asyncHandler } from '../utils.js';
import { fetchFeed, pollAllFeeds, pollSocialMentions, isRedditLikelyBlocked } from '../services/monitoring.js';
import { config } from '../config.js';

export const monitoringRouter = Router();
monitoringRouter.use(requireAuth);

const SENTIMENTS = ['EXCELLENT', 'GOOD', 'BAD', 'NEUTRAL'] as const;

function requireCompany(req: import('express').Request): string {
  const id = companyForInsert(req, req.body?.company_id ?? req.query?.company_id);
  if (!id) throw new HttpError(400, 'Seleccione una empresa');
  return id;
}

// ----- Keywords -----------------------------------------------------------

monitoringRouter.get('/keywords', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const rows = db.prepare(`SELECT * FROM monitoring_keywords WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params) as Record<string, unknown>[];
  res.json(mapRows(rows, { bool: ['is_active'] }));
});

monitoringRouter.post('/keywords', (req, res) => {
  const companyId = requireCompany(req);
  const keyword = requireString(req.body?.keyword, 'keyword');
  const id = uuid();
  db.prepare('INSERT INTO monitoring_keywords (id, company_id, keyword, is_active, created_by, created_at) VALUES (?, ?, ?, 1, ?, ?)').run(
    id, companyId, keyword, req.user!.id, nowIso()
  );
  res.status(201).json(mapRow(db.prepare('SELECT * FROM monitoring_keywords WHERE id = ?').get(id) as Record<string, unknown>, { bool: ['is_active'] }));
});

monitoringRouter.patch('/keywords/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const existing = db.prepare(`SELECT * FROM monitoring_keywords WHERE id = ? AND ${scope.sql}`).get(req.params.id, ...scope.params) as Record<string, unknown> | undefined;
  if (!existing) throw new HttpError(404, 'Palabra clave no encontrada');
  const b = req.body || {};
  db.prepare('UPDATE monitoring_keywords SET keyword = ?, is_active = ? WHERE id = ?').run(
    optionalString(b.keyword) || existing.keyword,
    b.is_active === undefined ? existing.is_active : toInt(b.is_active),
    existing.id
  );
  res.json(mapRow(db.prepare('SELECT * FROM monitoring_keywords WHERE id = ?').get(existing.id) as Record<string, unknown>, { bool: ['is_active'] }));
});

monitoringRouter.delete('/keywords/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const r = db.prepare(`DELETE FROM monitoring_keywords WHERE id = ? AND ${scope.sql}`).run(req.params.id, ...scope.params);
  if (r.changes === 0) throw new HttpError(404, 'Palabra clave no encontrada');
  res.json({ ok: true });
});

// ----- Articles -----------------------------------------------------------

const ARTICLE_MAP = { bool: ['read_status', 'sentiment_auto'], json: ['matched_keywords'] };

monitoringRouter.get('/articles', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const params: unknown[] = [...scope.params];
  let where = scope.sql;
  const platform = optionalString(req.query.platform);
  if (platform && platform !== 'ALL') {
    where += ' AND platform = ?';
    params.push(platform);
  }
  const rows = db.prepare(`SELECT * FROM monitored_articles WHERE ${where} ORDER BY discovered_at DESC LIMIT 2000`).all(...params) as Record<string, unknown>[];
  res.json(mapRows(rows, ARTICLE_MAP));
});

monitoringRouter.patch('/articles/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const existing = db.prepare(`SELECT * FROM monitored_articles WHERE id = ? AND ${scope.sql}`).get(req.params.id, ...scope.params) as Record<string, unknown> | undefined;
  if (!existing) throw new HttpError(404, 'Artículo no encontrado');
  const b = req.body || {};
  const sentiment = b.sentiment === undefined ? existing.sentiment : b.sentiment ? oneOf(b.sentiment, SENTIMENTS, 'sentiment') : null;
  // A human explicitly setting the sentiment overrides the automatic classification.
  const sentimentAuto = b.sentiment === undefined ? existing.sentiment_auto : 0;
  db.prepare('UPDATE monitored_articles SET sentiment = ?, sentiment_auto = ?, sentiment_notes = ?, read_status = ? WHERE id = ?').run(
    sentiment,
    sentimentAuto,
    b.sentiment_notes === undefined ? existing.sentiment_notes : optionalString(b.sentiment_notes),
    b.read_status === undefined ? existing.read_status : toInt(b.read_status),
    existing.id
  );
  res.json(mapRow(db.prepare('SELECT * FROM monitored_articles WHERE id = ?').get(existing.id) as Record<string, unknown>, ARTICLE_MAP));
});

monitoringRouter.delete('/articles/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const r = db.prepare(`DELETE FROM monitored_articles WHERE id = ? AND ${scope.sql}`).run(req.params.id, ...scope.params);
  if (r.changes === 0) throw new HttpError(404, 'Artículo no encontrado');
  res.json({ ok: true });
});

// ----- RSS feeds ----------------------------------------------------------

monitoringRouter.get('/feeds', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const rows = db.prepare(`SELECT * FROM rss_feeds WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params) as Record<string, unknown>[];
  res.json(mapRows(rows, { bool: ['is_active'] }));
});

monitoringRouter.post('/feeds', (req, res) => {
  const companyId = requireCompany(req);
  const url = requireString(req.body?.url, 'url');
  try {
    new URL(url);
  } catch {
    throw new HttpError(400, 'URL inválida');
  }
  const name = optionalString(req.body?.name) || new URL(url).hostname;
  const id = uuid();
  db.prepare('INSERT INTO rss_feeds (id, company_id, name, url, is_active, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)').run(
    id, companyId, name, url, req.user!.id, nowIso()
  );
  res.status(201).json(mapRow(db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(id) as Record<string, unknown>, { bool: ['is_active'] }));
});

monitoringRouter.patch('/feeds/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const existing = db.prepare(`SELECT * FROM rss_feeds WHERE id = ? AND ${scope.sql}`).get(req.params.id, ...scope.params) as Record<string, unknown> | undefined;
  if (!existing) throw new HttpError(404, 'Fuente no encontrada');
  const b = req.body || {};
  db.prepare('UPDATE rss_feeds SET name = ?, url = ?, is_active = ? WHERE id = ?').run(
    optionalString(b.name) || existing.name,
    optionalString(b.url) || existing.url,
    b.is_active === undefined ? existing.is_active : toInt(b.is_active),
    existing.id
  );
  res.json(mapRow(db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(existing.id) as Record<string, unknown>, { bool: ['is_active'] }));
});

monitoringRouter.delete('/feeds/:id', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const r = db.prepare(`DELETE FROM rss_feeds WHERE id = ? AND ${scope.sql}`).run(req.params.id, ...scope.params);
  if (r.changes === 0) throw new HttpError(404, 'Fuente no encontrada');
  res.json({ ok: true });
});

/** Fetch one feed now. */
monitoringRouter.post(
  '/feeds/:id/fetch',
  asyncHandler(async (req, res) => {
    const scope = scopeSql(req, 'company_id');
    const feed = db.prepare(`SELECT id, company_id, name, url FROM rss_feeds WHERE id = ? AND ${scope.sql}`).get(req.params.id, ...scope.params) as
      | { id: string; company_id: string | null; name: string; url: string }
      | undefined;
    if (!feed) throw new HttpError(404, 'Fuente no encontrada');
    const result = await fetchFeed(feed);
    const updated = db.prepare('SELECT * FROM rss_feeds WHERE id = ?').get(feed.id) as Record<string, unknown>;
    res.json({ ...result, feed: mapRow(updated, { bool: ['is_active'] }) });
  })
);

/** Fetch all active feeds now (SUPER_ADMIN/ADMIN). */
monitoringRouter.post(
  '/feeds/fetch-all',
  asyncHandler(async (req, res) => {
    if (req.user!.role === 'USER') throw new HttpError(403, 'No tiene permisos para esta acción');
    res.json(await pollAllFeeds());
  })
);

// ----- Redes sociales -------------------------------------------------------

monitoringRouter.get('/social/status', (_req, res) => {
  res.json({ reddit: config.social.redditEnabled, youtube: config.social.youtubeEnabled, redditBlocked: isRedditLikelyBlocked() });
});

/** Search Reddit (and YouTube, if configured) right now for the active company's keywords. */
monitoringRouter.post(
  '/social/fetch',
  asyncHandler(async (req, res) => {
    if (!config.social.redditEnabled && !config.social.youtubeEnabled) {
      throw new HttpError(400, 'El monitoreo de redes sociales no está habilitado en este servidor');
    }
    const companyId = requireCompany(req);
    const hasKeywords = db.prepare('SELECT 1 FROM monitoring_keywords WHERE is_active = 1 AND company_id = ?').get(companyId);
    if (!hasKeywords) throw new HttpError(400, 'Agregue al menos una palabra clave activa antes de buscar en redes sociales');
    const result = await pollSocialMentions(companyId);
    res.json({ ...result, redditBlocked: isRedditLikelyBlocked() });
  })
);

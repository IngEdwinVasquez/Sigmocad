import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql } from '../auth.js';
import { HttpError, optionalString } from '../utils.js';

export const metricsRouter = Router();
export const dashboardRouter = Router();
metricsRouter.use(requireAuth);
dashboardRouter.use(requireAuth);

function parseRange(req: import('express').Request) {
  const start = optionalString(req.query.start);
  const end = optionalString(req.query.end);
  if (!start || !end) throw new HttpError(400, 'Los parámetros "start" y "end" son obligatorios');
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) throw new HttpError(400, 'Rango de fechas inválido');
  return { start: s.toISOString(), end: e.toISOString() };
}

/** Metrics are scoped through the media they belong to. */
function metricsScope(req: import('express').Request) {
  const scope = scopeSql(req, 'm.company_id');
  return {
    sql: `(mt.media_id IN (SELECT m.id FROM media m WHERE ${scope.sql}))`,
    params: scope.params,
  };
}

/** GET /api/metrics?start=&end=&media_id= → raw rows (the client aggregates). */
metricsRouter.get('/', (req, res) => {
  const { start, end } = parseRange(req);
  const scope = metricsScope(req);
  const params: unknown[] = [...scope.params, start, end];
  let where = `${scope.sql} AND mt.created_at >= ? AND mt.created_at <= ?`;
  const mediaId = optionalString(req.query.media_id);
  if (mediaId && mediaId !== 'all') {
    where += ' AND mt.media_id = ?';
    params.push(mediaId);
  }
  const rows = db
    .prepare(`SELECT mt.* FROM metrics mt WHERE ${where} ORDER BY mt.created_at ASC LIMIT 50000`)
    .all(...params);
  res.json(rows);
});

/** GET /api/metrics/counts?start=&end=&media_id= → { impressions, clicks } */
metricsRouter.get('/counts', (req, res) => {
  const { start, end } = parseRange(req);
  const scope = metricsScope(req);
  const params: unknown[] = [...scope.params, start, end];
  let where = `${scope.sql} AND mt.created_at >= ? AND mt.created_at <= ?`;
  const mediaId = optionalString(req.query.media_id);
  if (mediaId && mediaId !== 'all') {
    where += ' AND mt.media_id = ?';
    params.push(mediaId);
  }
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN mt.type = 'IMPRESSION' THEN 1 ELSE 0 END) AS impressions,
         SUM(CASE WHEN mt.type = 'CLICK' THEN 1 ELSE 0 END) AS clicks
       FROM metrics mt WHERE ${where}`
    )
    .get(...params) as { impressions: number | null; clicks: number | null };
  res.json({ impressions: row.impressions || 0, clicks: row.clicks || 0 });
});

/** GET /api/dashboard/stats */
dashboardRouter.get('/stats', (req, res) => {
  const mediaScope = scopeSql(req, 'company_id');
  const slotScope = scopeSql(req, 'm.company_id');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();

  const count = (sql: string, params: unknown[]) => (db.prepare(sql).get(...params) as { c: number }).c;

  const mediaCount = count(`SELECT COUNT(*) AS c FROM media WHERE ${mediaScope.sql}`, mediaScope.params);
  const slotsCount = count(`SELECT COUNT(*) AS c FROM slots s JOIN media m ON m.id = s.media_id WHERE ${slotScope.sql}`, slotScope.params);
  const creativesCount = count(`SELECT COUNT(*) AS c FROM creatives WHERE ${mediaScope.sql}`, mediaScope.params);
  const assignmentsCount = count(
    `SELECT COUNT(*) AS c FROM assignments a JOIN slots s ON s.id = a.slot_id JOIN media m ON m.id = s.media_id WHERE ${slotScope.sql}`,
    slotScope.params
  );
  const scope = metricsScope(req);
  const impressionsToday = count(
    `SELECT COUNT(*) AS c FROM metrics mt WHERE ${scope.sql} AND mt.type = 'IMPRESSION' AND mt.created_at >= ?`,
    [...scope.params, todayIso]
  );
  const clicksToday = count(
    `SELECT COUNT(*) AS c FROM metrics mt WHERE ${scope.sql} AND mt.type = 'CLICK' AND mt.created_at >= ?`,
    [...scope.params, todayIso]
  );

  res.json({ mediaCount, slotsCount, creativesCount, assignmentsCount, impressionsToday, clicksToday });
});

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql, companyForInsert } from '../auth.js';
import { HttpError, uuid, nowIso, optionalString, optionalNumber, oneOf } from '../utils.js';

export const creativesRouter = Router();
creativesRouter.use(requireAuth);

const TYPES = ['IMAGE', 'GIF', 'VIDEO', 'HTML'] as const;
const STATUS = ['ACTIVE', 'PAUSED'] as const;

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT * FROM creatives WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Campaña no encontrada');
  return row;
}

function values(b: Record<string, unknown>, existing?: Record<string, unknown>) {
  const get = (key: string) => (b[key] === undefined && existing ? existing[key] : b[key]);
  return {
    name: optionalString(get('name')),
    type: oneOf(get('type'), TYPES, 'type', 'IMAGE'),
    src: optionalString(get('src')),
    src2: optionalString(get('src2')),
    html: optionalString(get('html')),
    click_url: optionalString(get('click_url')),
    width: optionalNumber(get('width')),
    height: optionalNumber(get('height')),
    duration_ms: optionalNumber(get('duration_ms')),
    campaign: optionalString(get('campaign')),
    status: oneOf(get('status'), STATUS, 'status', 'ACTIVE'),
  };
}

creativesRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const rows = db.prepare(`SELECT * FROM creatives WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params);
  res.json(rows);
});

creativesRouter.post('/', (req, res) => {
  const v = values(req.body || {});
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO creatives (id, company_id, name, type, src, src2, html, click_url, width, height, duration_ms, campaign, status, created_by, created_at, updated_at)
     VALUES (@id, @company_id, @name, @type, @src, @src2, @html, @click_url, @width, @height, @duration_ms, @campaign, @status, @created_by, @created_at, @updated_at)`
  ).run({ id, company_id: companyForInsert(req, req.body?.company_id), ...v, created_by: req.user!.id, created_at: now, updated_at: now });
  res.status(201).json(db.prepare('SELECT * FROM creatives WHERE id = ?').get(id));
});

creativesRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const v = values(req.body || {}, existing);
  db.prepare(
    `UPDATE creatives SET name=@name, type=@type, src=@src, src2=@src2, html=@html, click_url=@click_url, width=@width,
       height=@height, duration_ms=@duration_ms, campaign=@campaign, status=@status, updated_at=@updated_at WHERE id=@id`
  ).run({ ...v, updated_at: nowIso(), id: existing.id });
  res.json(db.prepare('SELECT * FROM creatives WHERE id = ?').get(existing.id));
});

creativesRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM creatives WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

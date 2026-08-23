import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql, companyForInsert } from '../auth.js';
import { HttpError, uuid, nowIso, requireString, optionalString, oneOf } from '../utils.js';

export const traditionalMediaRouter = Router();
traditionalMediaRouter.use(requireAuth);

const TYPES = ['TV', 'RADIO'] as const;
const STATUS = ['ACTIVE', 'PAUSED'] as const;

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT * FROM traditional_media WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Medio no encontrado');
  return row;
}

function values(b: Record<string, unknown>, existing?: Record<string, unknown>) {
  const get = (key: string) => (b[key] === undefined && existing ? existing[key] : b[key]);
  return {
    name: requireString(get('name'), 'name'),
    channel: optionalString(get('channel')),
    provincia: optionalString(get('provincia')),
    schedule: optionalString(get('schedule')),
    media_type: oneOf(get('media_type'), TYPES, 'media_type', 'TV'),
    cast_members: optionalString(get('cast_members')),
    cast_twitter: optionalString(get('cast_twitter')),
    cast_instagram: optionalString(get('cast_instagram')),
    cast_youtube: optionalString(get('cast_youtube')),
    cast_facebook: optionalString(get('cast_facebook')),
    cast_tiktok: optionalString(get('cast_tiktok')),
    status: oneOf(get('status'), STATUS, 'status', 'ACTIVE'),
  };
}

traditionalMediaRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  res.json(db.prepare(`SELECT * FROM traditional_media WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params));
});

traditionalMediaRouter.post('/', (req, res) => {
  const v = values(req.body || {});
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO traditional_media (id, company_id, name, channel, provincia, schedule, media_type, cast_members, cast_twitter,
       cast_instagram, cast_youtube, cast_facebook, cast_tiktok, status, created_by, created_at, updated_at)
     VALUES (@id, @company_id, @name, @channel, @provincia, @schedule, @media_type, @cast_members, @cast_twitter,
       @cast_instagram, @cast_youtube, @cast_facebook, @cast_tiktok, @status, @created_by, @created_at, @updated_at)`
  ).run({ id, company_id: companyForInsert(req, req.body?.company_id), ...v, created_by: req.user!.id, created_at: now, updated_at: now });
  res.status(201).json(db.prepare('SELECT * FROM traditional_media WHERE id = ?').get(id));
});

traditionalMediaRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const v = values(req.body || {}, existing);
  db.prepare(
    `UPDATE traditional_media SET name=@name, channel=@channel, provincia=@provincia, schedule=@schedule, media_type=@media_type,
       cast_members=@cast_members, cast_twitter=@cast_twitter, cast_instagram=@cast_instagram, cast_youtube=@cast_youtube,
       cast_facebook=@cast_facebook, cast_tiktok=@cast_tiktok, status=@status, updated_at=@updated_at WHERE id=@id`
  ).run({ ...v, updated_at: nowIso(), id: existing.id });
  res.json(db.prepare('SELECT * FROM traditional_media WHERE id = ?').get(existing.id));
});

traditionalMediaRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM traditional_media WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

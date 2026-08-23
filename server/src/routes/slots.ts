import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql } from '../auth.js';
import { HttpError, uuid, nowIso, optionalString, optionalNumber, oneOf } from '../utils.js';

export const slotsRouter = Router();
slotsRouter.use(requireAuth);

const STATUS = ['ACTIVE', 'PAUSED'] as const;

const SELECT = `
  SELECT s.*, m.name AS media_name, m.public_key AS media_public_key, m.company_id
  FROM slots s JOIN media m ON m.id = s.media_id`;

function shape(row: Record<string, unknown>) {
  const { media_name, media_public_key, company_id, ...rest } = row;
  return { ...rest, company_id, media: { id: row.media_id, name: media_name, public_key: media_public_key } };
}

function assertMediaInScope(req: import('express').Request, mediaId: string) {
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT id FROM media WHERE id = ? AND ${scope.sql}`).get(mediaId, ...scope.params);
  if (!row) throw new HttpError(400, 'Medio no encontrado');
}

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'm.company_id');
  const row = db.prepare(`${SELECT} WHERE s.id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Espacio no encontrado');
  return row;
}

/** Auto-generate SLOT-0001 style slugs (unique per media). */
function nextSlug(mediaId: string): string {
  const rows = db.prepare(`SELECT slug FROM slots WHERE media_id = ? AND slug LIKE 'SLOT-%'`).all(mediaId) as { slug: string }[];
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.slug.replace('SLOT-', ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `SLOT-${String(max + 1).padStart(4, '0')}`;
}

const insertSlot = db.prepare(
  `INSERT INTO slots (id, media_id, slug, width, height, campaign, status, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

function createSlot(req: import('express').Request, b: Record<string, unknown>): string {
  const mediaId = String(b.media_id || '');
  if (!mediaId) throw new HttpError(400, 'El campo "media_id" es obligatorio');
  assertMediaInScope(req, mediaId);

  const slug = optionalString(b.slug) || nextSlug(mediaId);
  const dup = db.prepare('SELECT 1 FROM slots WHERE media_id = ? AND slug = ?').get(mediaId, slug);
  if (dup) throw new HttpError(409, `Ya existe un espacio con la etiqueta "${slug}" en este medio`);

  const id = uuid();
  const now = nowIso();
  insertSlot.run(
    id,
    mediaId,
    slug,
    optionalNumber(b.width),
    optionalNumber(b.height),
    optionalString(b.campaign),
    oneOf(b.status, STATUS, 'status', 'ACTIVE'),
    now,
    now
  );
  return id;
}

slotsRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'm.company_id');
  const params: unknown[] = [...scope.params];
  let where = scope.sql;
  if (req.query.media_id) {
    where += ' AND s.media_id = ?';
    params.push(String(req.query.media_id));
  }
  if (req.query.status) {
    where += ' AND s.status = ?';
    params.push(String(req.query.status));
  }
  const rows = db.prepare(`${SELECT} WHERE ${where} ORDER BY s.created_at DESC`).all(...params) as Record<string, unknown>[];
  res.json(rows.map(shape));
});

slotsRouter.post('/', (req, res) => {
  const id = createSlot(req, req.body || {});
  res.status(201).json(shape(getScoped(req, id)));
});

slotsRouter.post('/bulk', (req, res) => {
  const items = Array.isArray(req.body?.items) ? (req.body.items as Record<string, unknown>[]) : [];
  if (items.length === 0) throw new HttpError(400, 'No hay elementos para importar');
  const run = db.transaction(() => {
    let count = 0;
    for (const item of items) {
      createSlot(req, item);
      count++;
    }
    return count;
  });
  res.status(201).json({ imported: run() });
});

slotsRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const b = req.body || {};
  const mediaId = optionalString(b.media_id) || String(existing.media_id);
  if (mediaId !== existing.media_id) assertMediaInScope(req, mediaId);

  const slug = optionalString(b.slug) || String(existing.slug);
  const dup = db.prepare('SELECT id FROM slots WHERE media_id = ? AND slug = ? AND id <> ?').get(mediaId, slug, existing.id);
  if (dup) throw new HttpError(409, `Ya existe un espacio con la etiqueta "${slug}" en este medio`);

  db.prepare(
    `UPDATE slots SET media_id = ?, slug = ?, width = ?, height = ?, campaign = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(
    mediaId,
    slug,
    b.width === undefined ? existing.width : optionalNumber(b.width),
    b.height === undefined ? existing.height : optionalNumber(b.height),
    b.campaign === undefined ? existing.campaign : optionalString(b.campaign),
    oneOf(b.status, STATUS, 'status', existing.status as (typeof STATUS)[number]),
    nowIso(),
    existing.id
  );
  res.json(shape(getScoped(req, String(existing.id))));
});

slotsRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM slots WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql } from '../auth.js';
import { HttpError, uuid, nowIso, optionalString, optionalNumber, toInt, mapRow } from '../utils.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireAuth);

const SELECT = `
  SELECT a.*,
         s.slug AS slot_slug, s.campaign AS slot_campaign, s.media_id AS slot_media_id,
         m.name AS media_name, m.company_id AS company_id,
         c.name AS creative_name, c.type AS creative_type, c.campaign AS creative_campaign
  FROM assignments a
  JOIN slots s ON s.id = a.slot_id
  JOIN media m ON m.id = s.media_id
  LEFT JOIN creatives c ON c.id = a.creative_id`;

function shape(row: Record<string, unknown>) {
  const r = mapRow(row, { bool: ['is_active'] })!;
  const {
    slot_slug, slot_campaign, slot_media_id, media_name, company_id,
    creative_name, creative_type, creative_campaign, ...rest
  } = r;
  return {
    ...rest,
    company_id,
    slots: { id: r.slot_id, slug: slot_slug, campaign: slot_campaign, media: { id: slot_media_id, name: media_name } },
    creatives: r.creative_id ? { id: r.creative_id, name: creative_name, type: creative_type, campaign: creative_campaign } : null,
  };
}

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'm.company_id');
  const row = db.prepare(`${SELECT} WHERE a.id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Asignación no encontrada');
  return row;
}

function assertSlotInScope(req: import('express').Request, slotId: string) {
  const scope = scopeSql(req, 'm.company_id');
  const row = db.prepare(`SELECT s.id FROM slots s JOIN media m ON m.id = s.media_id WHERE s.id = ? AND ${scope.sql}`).get(slotId, ...scope.params);
  if (!row) throw new HttpError(400, 'Espacio no encontrado');
}

function assertCreativeInScope(req: import('express').Request, creativeId: string | null) {
  if (!creativeId) return;
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT id FROM creatives WHERE id = ? AND ${scope.sql}`).get(creativeId, ...scope.params);
  if (!row) throw new HttpError(400, 'Campaña no encontrada');
}

function normalizeDate(v: unknown): string | null {
  const s = optionalString(v);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Fecha inválida: ${s}`);
  return d.toISOString();
}

const insertAssignment = db.prepare(
  `INSERT INTO assignments (id, slot_id, creative_id, is_active, weight, start_at, end_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

function create(req: import('express').Request, b: Record<string, unknown>): string {
  const slotId = String(b.slot_id || '');
  if (!slotId) throw new HttpError(400, 'El campo "slot_id" es obligatorio');
  const creativeId = optionalString(b.creative_id);
  assertSlotInScope(req, slotId);
  assertCreativeInScope(req, creativeId);

  const id = uuid();
  const now = nowIso();
  insertAssignment.run(
    id, slotId, creativeId, toInt(b.is_active), Math.max(1, optionalNumber(b.weight) ?? 1),
    normalizeDate(b.start_at), normalizeDate(b.end_at), now, now
  );
  return id;
}

assignmentsRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'm.company_id');
  const rows = db.prepare(`${SELECT} WHERE ${scope.sql} ORDER BY a.updated_at DESC`).all(...scope.params) as Record<string, unknown>[];
  res.json(rows.map(shape));
});

assignmentsRouter.post('/', (req, res) => {
  const id = create(req, req.body || {});
  res.status(201).json(shape(getScoped(req, id)));
});

assignmentsRouter.post('/bulk', (req, res) => {
  const items = Array.isArray(req.body?.items) ? (req.body.items as Record<string, unknown>[]) : [];
  if (items.length === 0) throw new HttpError(400, 'No hay elementos para importar');
  const run = db.transaction(() => {
    let count = 0;
    for (const item of items) {
      create(req, item);
      count++;
    }
    return count;
  });
  res.status(201).json({ imported: run() });
});

/** Create assignments for every slot/creative pair that shares a campaign name. */
assignmentsRouter.post('/auto-by-campaign', (req, res) => {
  const scope = scopeSql(req, 'm.company_id');
  const slots = db
    .prepare(`SELECT s.id, s.campaign FROM slots s JOIN media m ON m.id = s.media_id WHERE s.status = 'ACTIVE' AND s.campaign IS NOT NULL AND s.campaign <> '' AND ${scope.sql}`)
    .all(...scope.params) as { id: string; campaign: string }[];
  const cScope = scopeSql(req, 'company_id');
  const creatives = db
    .prepare(`SELECT id, campaign FROM creatives WHERE campaign IS NOT NULL AND campaign <> '' AND ${cScope.sql}`)
    .all(...cScope.params) as { id: string; campaign: string }[];

  const byCampaign = new Map<string, { slots: string[]; creatives: string[] }>();
  const key = (c: string) => c.trim().toLowerCase();
  for (const s of slots) {
    const k = key(s.campaign);
    if (!byCampaign.has(k)) byCampaign.set(k, { slots: [], creatives: [] });
    byCampaign.get(k)!.slots.push(s.id);
  }
  for (const c of creatives) {
    const k = key(c.campaign);
    if (!byCampaign.has(k)) byCampaign.set(k, { slots: [], creatives: [] });
    byCampaign.get(k)!.creatives.push(c.id);
  }

  const exists = db.prepare('SELECT 1 FROM assignments WHERE slot_id = ? AND creative_id = ?');
  const now = nowIso();
  const run = db.transaction(() => {
    let count = 0;
    for (const group of byCampaign.values()) {
      if (group.slots.length === 0 || group.creatives.length === 0) continue;
      for (const slotId of group.slots) {
        for (const creativeId of group.creatives) {
          if (exists.get(slotId, creativeId)) continue;
          insertAssignment.run(uuid(), slotId, creativeId, 1, 1, null, null, now, now);
          count++;
        }
      }
    }
    return count;
  });

  res.json({ created: run() });
});

assignmentsRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const b = req.body || {};
  const slotId = optionalString(b.slot_id) || String(existing.slot_id);
  const creativeId = b.creative_id === undefined ? (existing.creative_id as string | null) : optionalString(b.creative_id);
  if (slotId !== existing.slot_id) assertSlotInScope(req, slotId);
  if (creativeId !== existing.creative_id) assertCreativeInScope(req, creativeId);

  db.prepare(
    `UPDATE assignments SET slot_id = ?, creative_id = ?, is_active = ?, weight = ?, start_at = ?, end_at = ?, updated_at = ? WHERE id = ?`
  ).run(
    slotId,
    creativeId,
    b.is_active === undefined ? existing.is_active : toInt(b.is_active),
    b.weight === undefined ? existing.weight : Math.max(1, optionalNumber(b.weight) ?? 1),
    b.start_at === undefined ? existing.start_at : normalizeDate(b.start_at),
    b.end_at === undefined ? existing.end_at : normalizeDate(b.end_at),
    nowIso(),
    existing.id
  );
  res.json(shape(getScoped(req, String(existing.id))));
});

assignmentsRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM assignments WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

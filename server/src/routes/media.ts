import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql, companyForInsert } from '../auth.js';
import {
  HttpError, uuid, nowIso, requireString, optionalString, oneOf, toInt, toJson,
  mapRow, mapRows, generatePublicKey,
} from '../utils.js';

export const mediaRouter = Router();
mediaRouter.use(requireAuth);

const STATUS = ['ACTIVE', 'PAUSED'] as const;
const REVIEW = ['PENDING', 'APPROVED', 'REJECTED'] as const;
const MAP = { bool: ['has_ad_placement', 'publication_confirmed'], json: ['domains'] };

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT * FROM media WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Medio no encontrado');
  return row;
}

function normalizeDomains(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((d) => String(d).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(/[\n,]/).map((d) => d.trim()).filter(Boolean);
  return [];
}

function buildMediaValues(b: Record<string, unknown>, existing?: Record<string, unknown>) {
  const get = (key: string) => (b[key] === undefined && existing ? existing[key] : b[key]);
  return {
    name: requireString(get('name'), 'name'),
    domains: toJson(b.domains === undefined && existing ? JSON.parse(String(existing.domains || '[]')) : normalizeDomains(b.domains)),
    status: oneOf(get('status'), STATUS, 'status', 'ACTIVE'),
    has_ad_placement: toInt(get('has_ad_placement')),
    provincia: optionalString(get('provincia')),
    twitter_url: optionalString(get('twitter_url')),
    instagram_url: optionalString(get('instagram_url')),
    youtube_url: optionalString(get('youtube_url')),
    tiktok_url: optionalString(get('tiktok_url')),
    sitemap_url: optionalString(get('sitemap_url')),
    whatsapp: optionalString(get('whatsapp')),
    press_email: optionalString(get('press_email')),
  };
}

const insertMedia = db.prepare(
  `INSERT INTO media (id, company_id, name, public_key, domains, status, has_ad_placement, provincia,
     twitter_url, instagram_url, youtube_url, tiktok_url, sitemap_url, whatsapp, press_email, created_by, created_at, updated_at)
   VALUES (@id, @company_id, @name, @public_key, @domains, @status, @has_ad_placement, @provincia,
     @twitter_url, @instagram_url, @youtube_url, @tiktok_url, @sitemap_url, @whatsapp, @press_email, @created_by, @created_at, @updated_at)`
);

mediaRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const params: unknown[] = [...scope.params];
  let where = scope.sql;
  if (req.query.status) {
    where += ' AND status = ?';
    params.push(String(req.query.status));
  }
  const rows = db.prepare(`SELECT * FROM media WHERE ${where} ORDER BY created_at DESC`).all(...params) as Record<string, unknown>[];
  res.json(mapRows(rows, MAP));
});

mediaRouter.get('/:id', (req, res) => {
  res.json(mapRow(getScoped(req, req.params.id), MAP));
});

mediaRouter.post('/', (req, res) => {
  const values = buildMediaValues(req.body || {});
  const id = uuid();
  const now = nowIso();
  insertMedia.run({
    id,
    company_id: companyForInsert(req, req.body?.company_id),
    public_key: generatePublicKey(),
    ...values,
    created_by: req.user!.id,
    created_at: now,
    updated_at: now,
  });
  res.status(201).json(mapRow(db.prepare('SELECT * FROM media WHERE id = ?').get(id) as Record<string, unknown>, MAP));
});

/** Bulk import (Excel). Body: { items: [...] } */
mediaRouter.post('/bulk', (req, res) => {
  const items = Array.isArray(req.body?.items) ? (req.body.items as Record<string, unknown>[]) : [];
  if (items.length === 0) throw new HttpError(400, 'No hay elementos para importar');
  const companyId = companyForInsert(req, req.body?.company_id);
  const now = nowIso();

  const run = db.transaction(() => {
    let count = 0;
    for (const item of items) {
      if (!optionalString(item.name)) continue;
      insertMedia.run({
        id: uuid(),
        company_id: companyId,
        public_key: generatePublicKey(),
        ...buildMediaValues(item),
        created_by: req.user!.id,
        created_at: now,
        updated_at: now,
      });
      count++;
    }
    return count;
  });

  res.status(201).json({ imported: run() });
});

mediaRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const values = buildMediaValues(req.body || {}, existing);
  db.prepare(
    `UPDATE media SET name=@name, domains=@domains, status=@status, has_ad_placement=@has_ad_placement, provincia=@provincia,
       twitter_url=@twitter_url, instagram_url=@instagram_url, youtube_url=@youtube_url, tiktok_url=@tiktok_url,
       sitemap_url=@sitemap_url, whatsapp=@whatsapp, press_email=@press_email, updated_at=@updated_at
     WHERE id=@id`
  ).run({ ...values, updated_at: nowIso(), id: existing.id });
  res.json(mapRow(db.prepare('SELECT * FROM media WHERE id = ?').get(existing.id) as Record<string, unknown>, MAP));
});

/** Partial updates used by the review/publication buttons. */
mediaRouter.patch('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const b = req.body || {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (b.banner_review_status !== undefined) {
    updates.push('banner_review_status = ?');
    params.push(oneOf(b.banner_review_status, REVIEW, 'banner_review_status'));
  }
  if (b.publication_confirmed !== undefined) {
    updates.push('publication_confirmed = ?', 'publication_confirmed_at = ?');
    params.push(toInt(b.publication_confirmed), b.publication_confirmed ? nowIso() : null);
  }
  if (b.status !== undefined) {
    updates.push('status = ?');
    params.push(oneOf(b.status, STATUS, 'status'));
  }
  if (updates.length === 0) throw new HttpError(400, 'Nada que actualizar');

  updates.push('updated_at = ?');
  params.push(nowIso(), existing.id);
  db.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(mapRow(db.prepare('SELECT * FROM media WHERE id = ?').get(existing.id) as Record<string, unknown>, MAP));
});

mediaRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM media WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

/** Slot/assignment health check for a media outlet ("Verificar" button). */
mediaRouter.get('/:id/verification', (req, res) => {
  const media = mapRow(getScoped(req, req.params.id), MAP)!;

  if (!media.has_ad_placement) {
    return res.json({
      success: false,
      message: 'Este medio no tiene habilitada la colocación publicitaria. Active esta opción primero.',
      slots: [],
    });
  }

  const slots = db.prepare('SELECT id, slug, status FROM slots WHERE media_id = ? ORDER BY slug').all(media.id) as {
    id: string; slug: string; status: string;
  }[];

  if (slots.length === 0) {
    return res.json({ success: false, message: 'Este medio no tiene espacios asignados', slots: [] });
  }

  const assignmentsStmt = db.prepare(
    `SELECT a.id, a.is_active, a.creative_id, c.status AS creative_status
     FROM assignments a LEFT JOIN creatives c ON c.id = a.creative_id
     WHERE a.slot_id = ?`
  );

  const slotResults = slots.map((slot) => {
    const assignments = assignmentsStmt.all(slot.id) as { id: string; is_active: number; creative_id: string | null; creative_status: string | null }[];
    const active = assignments.filter((a) => a.is_active === 1);
    const hasActiveCreatives = active.some((a) => a.creative_status === 'ACTIVE');
    const isActive = slot.status === 'ACTIVE';

    if (assignments.length === 0) {
      return {
        slot: slot.slug,
        slotStatus: slot.status,
        assignmentsCount: 0,
        activeAssignmentsCount: 0,
        status: isActive ? 'info' : 'warning',
        message: isActive ? 'Espacio publicado (sin campañas asignadas)' : 'Espacio inactivo',
      };
    }

    return {
      slot: slot.slug,
      slotStatus: slot.status,
      assignmentsCount: assignments.length,
      activeAssignmentsCount: active.length,
      hasActiveCreatives,
      status: isActive && hasActiveCreatives ? 'ok' : isActive ? 'info' : 'warning',
      message:
        isActive && hasActiveCreatives
          ? 'Funcionando correctamente con campañas activas'
          : isActive && active.length > 0
            ? 'Espacio publicado con asignaciones inactivas'
            : isActive
              ? 'Espacio publicado sin asignaciones'
              : 'Espacio inactivo',
    };
  });

  res.json({
    success: true,
    slots: slotResults,
    totalSlots: slots.length,
    workingSlots: slotResults.filter((r) => r.status === 'ok' || r.status === 'info').length,
  });
});

/** Manual news-URL verification for a media outlet. */
mediaRouter.post('/:id/news-verification', (req, res) => {
  const media = getScoped(req, req.params.id);
  const newsUrl = requireString(req.body?.news_url, 'news_url');
  const now = nowIso();
  const id = uuid();
  db.prepare(
    `INSERT INTO news_verification (id, news_id, media_id, news_url, verified, verified_at, verification_method, created_at, updated_at)
     VALUES (?, NULL, ?, ?, 1, ?, 'MANUAL', ?, ?)`
  ).run(id, media.id, newsUrl, now, now, now);
  res.status(201).json({ id, media_id: media.id, news_url: newsUrl, verified: true, verified_at: now });
});

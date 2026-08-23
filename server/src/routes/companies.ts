import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { HttpError, uuid, nowIso, requireString, optionalString, oneOf, slugify } from '../utils.js';

export const companiesRouter = Router();
export const publicCompaniesRouter = Router();

const STATUS = ['ACTIVE', 'INACTIVE'] as const;

/** Public: used by the login page to show the company branding (?company=slug). */
publicCompaniesRouter.get('/by-slug/:slug', (req, res) => {
  const row = db
    .prepare('SELECT id, name, slug, logo_url FROM companies WHERE slug = ? AND status = ?')
    .get(req.params.slug, 'ACTIVE');
  if (!row) throw new HttpError(404, 'Empresa no encontrada');
  res.json(row);
});

companiesRouter.use(requireAuth);

/** Any authenticated user can list active companies (selectors). Admins get all. */
companiesRouter.get('/', (req, res) => {
  const all = req.query.all === 'true' && req.user!.role === 'SUPER_ADMIN';
  const rows = all
    ? db.prepare('SELECT * FROM companies ORDER BY name').all()
    : req.user!.role === 'SUPER_ADMIN'
      ? db.prepare('SELECT * FROM companies WHERE status = ? ORDER BY name').all('ACTIVE')
      : db.prepare('SELECT * FROM companies WHERE id = ? ORDER BY name').all(req.user!.company_id);
  res.json(rows);
});

function uniqueSlug(base: string, excludeId?: string): string {
  let slug = base || 'empresa';
  let i = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM companies WHERE slug = ?').get(slug) as { id: string } | undefined;
    if (!row || row.id === excludeId) return slug;
    slug = `${base}-${i++}`;
  }
}

companiesRouter.post('/', requireRole('SUPER_ADMIN'), (req, res) => {
  const b = req.body || {};
  const name = requireString(b.name, 'name');
  const status = oneOf(b.status, STATUS, 'status', 'ACTIVE');
  const slug = uniqueSlug(slugify(optionalString(b.slug) || name));
  const now = nowIso();
  const id = uuid();

  db.prepare(
    `INSERT INTO companies (id, name, slug, logo_url, website_url, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, slug, optionalString(b.logo_url), optionalString(b.website_url), status, now, now);

  res.status(201).json(db.prepare('SELECT * FROM companies WHERE id = ?').get(id));
});

companiesRouter.put('/:id', requireRole('ADMIN', 'SUPER_ADMIN'), (req, res) => {
  const existing = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id) as
    | { id: string; name: string; slug: string | null; logo_url: string | null; website_url: string | null; status: string }
    | undefined;
  if (!existing) throw new HttpError(404, 'Empresa no encontrada');
  if (req.user!.role !== 'SUPER_ADMIN' && req.user!.company_id !== existing.id) {
    throw new HttpError(403, 'Solo puede editar su propia empresa');
  }

  const b = req.body || {};
  const name = optionalString(b.name) || existing.name;
  const status = oneOf(b.status, STATUS, 'status', existing.status as (typeof STATUS)[number]);
  const slug = b.slug !== undefined ? uniqueSlug(slugify(optionalString(b.slug) || name), existing.id) : existing.slug || uniqueSlug(slugify(name), existing.id);

  db.prepare(
    `UPDATE companies SET name = ?, slug = ?, logo_url = ?, website_url = ?, status = ?, updated_at = ? WHERE id = ?`
  ).run(
    name,
    slug,
    b.logo_url === undefined ? existing.logo_url : optionalString(b.logo_url),
    b.website_url === undefined ? existing.website_url : optionalString(b.website_url),
    status,
    nowIso(),
    existing.id
  );

  res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(existing.id));
});

companiesRouter.delete('/:id', requireRole('SUPER_ADMIN'), (req, res) => {
  const result = db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  if (result.changes === 0) throw new HttpError(404, 'Empresa no encontrada');
  res.json({ ok: true });
});

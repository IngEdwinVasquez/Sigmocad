import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, requireAuth, requireRole, type Role } from '../auth.js';
import { asyncHandler, HttpError, uuid, nowIso, requireString, optionalString, mapRows, mapRow, oneOf, toInt } from '../utils.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'));

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'USER'] as const;

const USER_SELECT = `
  SELECT u.id, u.email, u.full_name, u.role, u.company_id, u.institution_name, u.institution_logo_url,
         u.is_active, u.last_login_at, u.created_at, u.updated_at,
         c.name AS company_name
  FROM users u LEFT JOIN companies c ON c.id = u.company_id`;

function shape(row: Record<string, unknown>) {
  const u = mapRow(row, { bool: ['is_active'] })!;
  const { company_name, ...rest } = u as Record<string, unknown>;
  return {
    ...rest,
    companies: u.company_id ? { id: u.company_id, name: company_name } : null,
  };
}

/** ADMIN users may only manage users of their own company and may not grant SUPER_ADMIN. */
function assertCanManage(req: import('express').Request, targetCompanyId: string | null, targetRole?: Role) {
  const me = req.user!;
  if (me.role === 'SUPER_ADMIN') return;
  if (!me.company_id || targetCompanyId !== me.company_id) {
    throw new HttpError(403, 'Solo puede gestionar usuarios de su propia empresa');
  }
  if (targetRole === 'SUPER_ADMIN') throw new HttpError(403, 'No puede asignar el rol SUPER_ADMIN');
}

usersRouter.get('/', (req, res) => {
  const me = req.user!;
  let rows: Record<string, unknown>[];
  if (me.role === 'SUPER_ADMIN') {
    rows = req.companyId
      ? (db.prepare(`${USER_SELECT} WHERE u.company_id = ? ORDER BY u.email`).all(req.companyId) as Record<string, unknown>[])
      : (db.prepare(`${USER_SELECT} ORDER BY u.email`).all() as Record<string, unknown>[]);
  } else {
    rows = db.prepare(`${USER_SELECT} WHERE u.company_id = ? ORDER BY u.email`).all(me.company_id) as Record<string, unknown>[];
  }
  res.json(mapRows(rows).map(shape));
});

usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const email = requireString(b.email, 'email').toLowerCase();
    const password = typeof b.password === 'string' ? b.password : '';
    if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
    const role = oneOf(b.role, ROLES, 'role', 'USER');
    const companyId = req.user!.role === 'SUPER_ADMIN' ? optionalString(b.company_id) : req.user!.company_id;

    assertCanManage(req, companyId, role);

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'Ya existe un usuario con ese correo');
    }

    const id = uuid();
    const now = nowIso();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, role, company_id, institution_name, institution_logo_url, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      email,
      await hashPassword(password),
      optionalString(b.full_name),
      role,
      companyId,
      optionalString(b.institution_name),
      optionalString(b.institution_logo_url),
      b.is_active === undefined ? 1 : toInt(b.is_active),
      now,
      now
    );

    const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id) as Record<string, unknown>;
    res.status(201).json(shape(row));
  })
);

usersRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT id, role, company_id FROM users WHERE id = ?').get(req.params.id) as
      | { id: string; role: Role; company_id: string | null }
      | undefined;
    if (!existing) throw new HttpError(404, 'Usuario no encontrado');

    const b = req.body || {};
    const role = oneOf(b.role, ROLES, 'role', existing.role);
    const companyId =
      req.user!.role === 'SUPER_ADMIN'
        ? b.company_id === undefined
          ? existing.company_id
          : optionalString(b.company_id)
        : existing.company_id;

    assertCanManage(req, existing.company_id, existing.role);
    assertCanManage(req, companyId, role);

    if (existing.id === req.user!.id && role !== req.user!.role) {
      throw new HttpError(400, 'No puede cambiar su propio rol');
    }

    const isActive = b.is_active === undefined ? undefined : toInt(b.is_active);
    if (existing.id === req.user!.id && isActive === 0) {
      throw new HttpError(400, 'No puede desactivar su propio usuario');
    }

    db.prepare(
      `UPDATE users SET
         full_name = COALESCE(?, full_name),
         role = ?,
         company_id = ?,
         institution_name = ?,
         institution_logo_url = ?,
         is_active = COALESCE(?, is_active),
         updated_at = ?
       WHERE id = ?`
    ).run(
      b.full_name === undefined ? null : optionalString(b.full_name) ?? '',
      role,
      companyId,
      optionalString(b.institution_name),
      optionalString(b.institution_logo_url),
      isActive ?? null,
      nowIso(),
      existing.id
    );

    if (typeof b.password === 'string' && b.password.length > 0) {
      if (b.password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(b.password), existing.id);
    }

    const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(existing.id) as Record<string, unknown>;
    res.json(shape(row));
  })
);

usersRouter.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id, role, company_id FROM users WHERE id = ?').get(req.params.id) as
    | { id: string; role: Role; company_id: string | null }
    | undefined;
  if (!existing) throw new HttpError(404, 'Usuario no encontrado');
  if (existing.id === req.user!.id) throw new HttpError(400, 'No puede eliminar su propio usuario');
  assertCanManage(req, existing.company_id, existing.role);

  db.prepare('DELETE FROM users WHERE id = ?').run(existing.id);
  res.json({ ok: true });
});

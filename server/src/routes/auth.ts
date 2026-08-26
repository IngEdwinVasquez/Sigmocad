import { Router } from 'express';
import { db } from '../db.js';
import { config } from '../config.js';
import { hashPassword, verifyPassword, signToken, requireAuth, loadUser, type AuthUser } from '../auth.js';
import { asyncHandler, HttpError, uuid, nowIso, requireString } from '../utils.js';

export const authRouter = Router();

interface CompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
}

function profileFor(user: AuthUser) {
  const company = user.company_id
    ? (db.prepare('SELECT id, name, logo_url, website_url FROM companies WHERE id = ?').get(user.company_id) as CompanyRow | undefined)
    : undefined;
  return { ...user, companies: company || null };
}

function validatePassword(password: unknown): string {
  const p = typeof password === 'string' ? password : '';
  if (p.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres');
  return p;
}

/** Public configuration needed by the client before login. */
authRouter.get('/config', (_req, res) => {
  res.json({
    publicUrl: config.publicUrl,
    allowRegistration: config.allowRegistration,
    smtpConfigured: config.smtp.configured,
    socialMonitoring: { reddit: config.social.redditEnabled, youtube: config.social.youtubeEnabled },
  });
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, 'email').toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const row = db.prepare('SELECT id, password_hash, is_active FROM users WHERE email = ?').get(email) as
      | { id: string; password_hash: string; is_active: number }
      | undefined;

    if (!row || !(await verifyPassword(password, row.password_hash))) {
      throw new HttpError(401, 'Credenciales inválidas');
    }
    if (row.is_active !== 1) throw new HttpError(403, 'Usuario desactivado. Contacte al administrador');

    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), row.id);
    const user = loadUser(row.id)!;
    res.json({ token: signToken(user.id), user: profileFor(user) });
  })
);

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (!config.allowRegistration) throw new HttpError(403, 'El registro público está deshabilitado');

    const email = requireString(req.body?.email, 'email').toLowerCase();
    const password = validatePassword(req.body?.password);
    const fullName = typeof req.body?.full_name === 'string' ? req.body.full_name.trim() || null : null;

    const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    if (exists) throw new HttpError(409, 'Ya existe un usuario con ese correo');

    const now = nowIso();
    const id = uuid();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'USER', 1, ?, ?)`
    ).run(id, email, await hashPassword(password), fullName, now, now);

    const user = loadUser(id)!;
    res.status(201).json({ token: signToken(id), user: profileFor(user) });
  })
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: profileFor(req.user!) });
});

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const next = validatePassword(req.body?.new_password);

    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as { password_hash: string };
    if (!(await verifyPassword(current, row.password_hash))) throw new HttpError(400, 'La contraseña actual es incorrecta');

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(await hashPassword(next), nowIso(), req.user!.id);
    res.json({ ok: true });
  })
);

authRouter.post('/logout', (_req, res) => {
  // Stateless JWT: the client discards the token.
  res.json({ ok: true });
});

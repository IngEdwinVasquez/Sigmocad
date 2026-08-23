import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { config } from './config.js';
import { HttpError } from './utils.js';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  institution_name: string | null;
  institution_logo_url: string | null;
  is_active: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      /** Company scope resolved for this request (null = all companies, only for SUPER_ADMIN). */
      companyId?: string | null;
    }
  }
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
}

const selectUser = db.prepare(
  `SELECT id, email, full_name, role, company_id, institution_name, institution_logo_url, is_active
   FROM users WHERE id = ?`
);

export function loadUser(id: string): AuthUser | null {
  const row = selectUser.get(id) as (Omit<AuthUser, 'is_active'> & { is_active: number }) | undefined;
  if (!row) return null;
  return { ...row, is_active: row.is_active === 1 };
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  if (typeof req.query.token === 'string') return req.query.token;
  return null;
}

/** Requires a valid JWT; loads the user and resolves the company scope. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(new HttpError(401, 'No autenticado'));

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
  } catch {
    return next(new HttpError(401, 'Sesión inválida o expirada'));
  }

  const user = loadUser(String(payload.sub));
  if (!user) return next(new HttpError(401, 'Usuario no encontrado'));
  if (!user.is_active) return next(new HttpError(403, 'Usuario desactivado'));

  req.user = user;

  if (user.role === 'SUPER_ADMIN') {
    const header = req.headers['x-company-id'];
    const selected = Array.isArray(header) ? header[0] : header;
    req.companyId = selected && selected !== 'all' ? selected : null;
  } else {
    req.companyId = user.company_id;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new HttpError(401, 'No autenticado'));
    if (!roles.includes(req.user.role)) return next(new HttpError(403, 'No tiene permisos para esta acción'));
    next();
  };
}

export const isAdmin = (user: AuthUser) => user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

/**
 * SQL fragment + params to restrict a query by company.
 * `column` is the fully-qualified column (e.g. "m.company_id").
 */
export function scopeSql(req: Request, column: string): { sql: string; params: unknown[] } {
  if (req.companyId === null || req.companyId === undefined) {
    // SUPER_ADMIN viewing all companies
    if (req.user?.role === 'SUPER_ADMIN') return { sql: '1=1', params: [] };
    // Non-super user without company: sees nothing
    return { sql: '1=0', params: [] };
  }
  return { sql: `${column} = ?`, params: [req.companyId] };
}

/** Company to attach to newly created records. */
export function companyForInsert(req: Request, bodyCompanyId?: unknown): string | null {
  if (req.user?.role === 'SUPER_ADMIN') {
    if (req.companyId) return req.companyId;
    if (typeof bodyCompanyId === 'string' && bodyCompanyId) return bodyCompanyId;
    return null;
  }
  if (!req.companyId) throw new HttpError(400, 'Su usuario no tiene una empresa asignada');
  return req.companyId;
}

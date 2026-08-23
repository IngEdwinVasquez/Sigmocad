import { randomUUID, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const uuid = () => randomUUID();
export const nowIso = () => new Date().toISOString();

export function generatePublicKey(): string {
  return 'pk_' + randomBytes(12).toString('hex');
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Wrap async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

type Row = Record<string, unknown>;

/**
 * Convert a SQLite row into JSON-friendly output:
 * - listed boolean columns become true/false
 * - listed JSON columns are parsed (fallback to `[]`)
 */
export function mapRow<T = Row>(
  row: Row | undefined,
  opts: { bool?: string[]; json?: string[] } = {}
): T | null {
  if (!row) return null;
  const out: Row = { ...row };
  for (const key of opts.bool || []) {
    if (key in out) out[key] = out[key] === 1 || out[key] === true;
  }
  for (const key of opts.json || []) {
    if (key in out) {
      const raw = out[key];
      if (typeof raw === 'string') {
        try {
          out[key] = JSON.parse(raw);
        } catch {
          out[key] = [];
        }
      } else if (raw === null || raw === undefined) {
        out[key] = [];
      }
    }
  }
  return out as T;
}

export function mapRows<T = Row>(rows: Row[], opts: { bool?: string[]; json?: string[] } = {}): T[] {
  return rows.map((r) => mapRow<T>(r, opts)!) as T[];
}

export const toInt = (v: unknown): number => (v ? 1 : 0);
export const toJson = (v: unknown): string => JSON.stringify(Array.isArray(v) ? v : v ?? []);

export function optionalString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function optionalNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function requireString(v: unknown, field: string): string {
  const s = optionalString(v);
  if (!s) throw new HttpError(400, `El campo "${field}" es obligatorio`);
  return s;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
  throw new HttpError(400, `Valor inválido para "${field}". Permitidos: ${allowed.join(', ')}`);
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0];
  const ip = (first || (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unknown').trim();
  return ip.replace(/^::ffff:/, '');
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

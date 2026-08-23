import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server root (works from src/ in dev and dist/ in prod)
const serverRoot = path.resolve(__dirname, '..');

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

const port = Number(env('PORT', '4000'));
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port,
  /** Public base URL of this server (used for embed snippets, uploads and e-mails). */
  publicUrl: env('PUBLIC_URL', `http://localhost:${port}`).replace(/\/+$/, ''),
  jwtSecret: env('JWT_SECRET', isProduction ? '' : 'dev-secret-change-me'),
  jwtExpiresIn: env('JWT_EXPIRES_IN', '7d'),
  dbPath: path.resolve(serverRoot, env('DB_PATH', 'data/sigmocad.db')),
  /** WAL is fastest on local disks; use DELETE on network shares (e.g. Azure App Service /home). */
  sqliteJournalMode: env('SQLITE_JOURNAL_MODE', 'WAL').toUpperCase(),
  uploadDir: path.resolve(serverRoot, env('UPLOAD_DIR', 'uploads')),
  clientDist: path.resolve(serverRoot, env('CLIENT_DIST', '../client/dist')),
  corsOrigins: env('CORS_ORIGINS', 'http://localhost:5180')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  allowRegistration: envBool('ALLOW_PUBLIC_REGISTRATION', false),
  geoLookup: envBool('GEO_LOOKUP', true),
  seedAdmin: {
    email: env('ADMIN_EMAIL', 'admin@sigmocad.com'),
    password: env('ADMIN_PASSWORD', 'Admin123!'),
    fullName: env('ADMIN_NAME', 'Administrador'),
  },
  /** Example institution created with the first admin (empty name = none). */
  seedCompanyName: process.env.SEED_COMPANY_NAME ?? 'Institución de Ejemplo',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: envBool('SMTP_SECURE', true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || (process.env.SMTP_USER ? `SIGMOCAD <${process.env.SMTP_USER}>` : ''),
    get configured() {
      return Boolean(this.host && this.user && this.pass);
    },
  },
  rss: {
    pollMinutes: Number(env('RSS_POLL_MINUTES', '15')),
    webhookSecret: process.env.RSS_WEBHOOK_SECRET || '',
  },
  maxUploadMb: Number(env('MAX_UPLOAD_MB', '50')),
};

if (!config.jwtSecret) {
  throw new Error('JWT_SECRET must be set in production');
}

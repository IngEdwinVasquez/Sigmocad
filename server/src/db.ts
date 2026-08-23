import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { uuid, nowIso } from './utils.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPER_ADMIN','ADMIN','USER')),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  institution_name TEXT,
  institution_logo_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE,
  domains TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  has_ad_placement INTEGER NOT NULL DEFAULT 0,
  provincia TEXT,
  twitter_url TEXT,
  instagram_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  sitemap_url TEXT,
  whatsapp TEXT,
  press_email TEXT,
  banner_review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (banner_review_status IN ('PENDING','APPROVED','REJECTED')),
  publication_confirmed INTEGER NOT NULL DEFAULT 0,
  publication_confirmed_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_company ON media(company_id);

CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (media_id, slug)
);

CREATE TABLE IF NOT EXISTS creatives (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT,
  type TEXT NOT NULL CHECK (type IN ('IMAGE','GIF','VIDEO','HTML')),
  src TEXT,
  src2 TEXT,
  html TEXT,
  click_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  campaign TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creatives_company ON creatives(company_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  creative_id TEXT REFERENCES creatives(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 1,
  start_at TEXT,
  end_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assignments_slot ON assignments(slot_id);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id TEXT,
  slot_id TEXT,
  creative_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('IMPRESSION','CLICK')),
  user_agent TEXT,
  ip TEXT,
  referrer TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  language TEXT,
  sentiment_label TEXT,
  sentiment_score REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_created ON metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_metrics_media ON metrics(media_id, created_at);

CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING','IN_PROGRESS','COMPLETED')),
  last_verified_at TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS news_verification (
  id TEXT PRIMARY KEY,
  news_id TEXT REFERENCES news(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  news_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  verification_method TEXT,
  verified_on_website INTEGER NOT NULL DEFAULT 0,
  website_url TEXT,
  verified_on_instagram INTEGER NOT NULL DEFAULT 0,
  instagram_url TEXT,
  verified_on_twitter INTEGER NOT NULL DEFAULT 0,
  twitter_url TEXT,
  verified_on_youtube INTEGER NOT NULL DEFAULT 0,
  youtube_url TEXT,
  verified_on_tiktok INTEGER NOT NULL DEFAULT 0,
  tiktok_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_verification_unique ON news_verification(news_id, media_id) WHERE news_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS news_submissions (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  document_url TEXT,
  document_type TEXT,
  image_urls TEXT NOT NULL DEFAULT '[]',
  recipient_filter TEXT NOT NULL DEFAULT 'ALL',
  media_recipients TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_history (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  news_submission_id TEXT REFERENCES news_submissions(id) ON DELETE SET NULL,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('SENT','FAILED','PENDING')),
  sent_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_history_company ON email_history(company_id, sent_at);

CREATE TABLE IF NOT EXISTS traditional_media (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT,
  provincia TEXT,
  schedule TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('TV','RADIO')),
  cast_members TEXT,
  cast_twitter TEXT,
  cast_instagram TEXT,
  cast_youtube TEXT,
  cast_facebook TEXT,
  cast_tiktok TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_keywords (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitored_articles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  matched_keywords TEXT NOT NULL DEFAULT '[]',
  sentiment TEXT CHECK (sentiment IS NULL OR sentiment IN ('EXCELLENT','GOOD','BAD','NEUTRAL')),
  sentiment_notes TEXT,
  read_status INTEGER NOT NULL DEFAULT 0,
  UNIQUE (company_id, url)
);

CREATE TABLE IF NOT EXISTS rss_feeds (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_error TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
`;

// Create the schema as soon as the module loads so that other modules can
// prepare statements at import time.
db.exec(SCHEMA);

export function initDatabase() {
  seedAdmin();
}

function seedAdmin() {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
  if (count > 0) return;

  const { email, password, fullName } = config.seedAdmin;
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'SUPER_ADMIN', 1, ?, ?)`
  ).run(uuid(), email.toLowerCase(), bcrypt.hashSync(password, 10), fullName, now, now);

  console.log('--------------------------------------------------------------');
  console.log(`Usuario administrador inicial creado: ${email}`);
  if (password === 'Admin123!') {
    console.log('ATENCIÓN: contraseña por defecto "Admin123!". Cámbiela al iniciar sesión.');
  }
  console.log('--------------------------------------------------------------');
}

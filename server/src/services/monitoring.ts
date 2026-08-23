import Parser from 'rss-parser';
import { db } from '../db.js';
import { config } from '../config.js';
import { uuid, nowIso, toJson } from '../utils.js';

export interface IncomingArticle {
  title: string;
  description?: string | null;
  link: string;
  source: string;
  pubDate?: string | null;
}

export interface ProcessResult {
  company_id: string;
  matched_keywords: string[];
  status: 'saved' | 'duplicate' | 'error';
  error?: string;
}

interface KeywordRow {
  id: string;
  company_id: string;
  keyword: string;
}

const insertArticle = db.prepare(
  `INSERT INTO monitored_articles
     (id, company_id, title, description, url, source, published_at, discovered_at, matched_keywords, read_status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
);

/**
 * Match an article against active keywords and store it for every company with a match.
 * If `onlyCompanyId` is given, only that company's keywords are considered.
 */
export function processArticle(article: IncomingArticle, onlyCompanyId: string | null = null): ProcessResult[] {
  const keywords = (
    onlyCompanyId
      ? db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1 AND company_id = ?').all(onlyCompanyId)
      : db.prepare('SELECT id, company_id, keyword FROM monitoring_keywords WHERE is_active = 1').all()
  ) as KeywordRow[];

  if (keywords.length === 0) return [];

  const content = `${article.title.toLowerCase()} ${(article.description || '').toLowerCase()}`;
  const matches = new Map<string, string[]>();

  for (const kw of keywords) {
    const needle = kw.keyword.trim().replace(/^"|"$/g, '').toLowerCase();
    if (needle && content.includes(needle)) {
      if (!matches.has(kw.company_id)) matches.set(kw.company_id, []);
      matches.get(kw.company_id)!.push(kw.keyword);
    }
  }

  const results: ProcessResult[] = [];
  for (const [companyId, matched] of matches.entries()) {
    try {
      insertArticle.run(
        uuid(),
        companyId,
        article.title,
        article.description || null,
        article.link,
        article.source,
        article.pubDate ? new Date(article.pubDate).toISOString() : nowIso(),
        nowIso(),
        toJson(matched)
      );
      results.push({ company_id: companyId, matched_keywords: matched, status: 'saved' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('UNIQUE')) {
        results.push({ company_id: companyId, matched_keywords: matched, status: 'duplicate' });
      } else {
        results.push({ company_id: companyId, matched_keywords: matched, status: 'error', error: message });
      }
    }
  }
  return results;
}

interface FeedRow {
  id: string;
  company_id: string | null;
  name: string;
  url: string;
}

const parser = new Parser({ timeout: 15000, headers: { 'User-Agent': 'SIGMOCAD-RSS/1.0' } });

export async function fetchFeed(feed: FeedRow): Promise<{ processed: number; saved: number }> {
  let processed = 0;
  let saved = 0;
  try {
    const parsed = await parser.parseURL(feed.url);
    const sourceName = feed.name || parsed.title || feed.url;
    for (const item of parsed.items || []) {
      if (!item.title || !item.link) continue;
      processed++;
      const results = processArticle(
        {
          title: item.title,
          description: item.contentSnippet || item.content || item.summary || null,
          link: item.link,
          source: sourceName,
          pubDate: item.isoDate || item.pubDate || null,
        },
        feed.company_id
      );
      saved += results.filter((r) => r.status === 'saved').length;
    }
    db.prepare('UPDATE rss_feeds SET last_fetched_at = ?, last_error = NULL WHERE id = ?').run(nowIso(), feed.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare('UPDATE rss_feeds SET last_fetched_at = ?, last_error = ? WHERE id = ?').run(nowIso(), message, feed.id);
  }
  return { processed, saved };
}

export async function pollAllFeeds(): Promise<{ feeds: number; processed: number; saved: number }> {
  const feeds = db.prepare('SELECT id, company_id, name, url FROM rss_feeds WHERE is_active = 1').all() as FeedRow[];
  let processed = 0;
  let saved = 0;
  for (const feed of feeds) {
    const r = await fetchFeed(feed);
    processed += r.processed;
    saved += r.saved;
  }
  return { feeds: feeds.length, processed, saved };
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startRssPoller() {
  const minutes = config.rss.pollMinutes;
  if (!minutes || minutes <= 0) return;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await pollAllFeeds();
      if (r.feeds > 0) console.log(`[rss] ${r.feeds} fuentes, ${r.processed} artículos, ${r.saved} nuevos`);
    } catch (err) {
      console.error('[rss] error en el sondeo:', err);
    } finally {
      running = false;
    }
  };

  // first run shortly after boot, then on the configured interval
  setTimeout(tick, 10_000).unref();
  timer = setInterval(tick, minutes * 60 * 1000);
  timer.unref();
}

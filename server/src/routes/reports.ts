import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, scopeSql } from '../auth.js';
import { mapRows } from '../utils.js';

export const reportsRouter = Router();
export const emailHistoryRouter = Router();
reportsRouter.use(requireAuth);
emailHistoryRouter.use(requireAuth);

interface MediaRow {
  id: string; name: string; provincia: string | null; status: string; domains: string[];
  whatsapp: string | null; press_email: string | null;
}
interface TradRow {
  id: string; name: string; provincia: string | null; channel: string | null; schedule: string | null;
  media_type: string; status: string;
}
interface AssignmentRow { media_id: string; start_at: string | null; end_at: string | null }

/** Consolidated media report (digital + TV/Radio) with contract info derived from active assignments. */
reportsRouter.get('/media', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const digital = mapRows<MediaRow>(
    db.prepare(`SELECT id, name, provincia, status, domains, whatsapp, press_email FROM media WHERE ${scope.sql} ORDER BY name`).all(...scope.params) as Record<string, unknown>[],
    { json: ['domains'] }
  );
  const traditional = db
    .prepare(`SELECT id, name, provincia, channel, schedule, media_type, status FROM traditional_media WHERE ${scope.sql} ORDER BY name`)
    .all(...scope.params) as TradRow[];

  const mScope = scopeSql(req, 'm.company_id');
  const activeAssignments = db
    .prepare(
      `SELECT s.media_id, a.start_at, a.end_at
       FROM assignments a JOIN slots s ON s.id = a.slot_id JOIN media m ON m.id = s.media_id
       WHERE a.is_active = 1 AND ${mScope.sql}`
    )
    .all(...mScope.params) as AssignmentRow[];

  const byMedia = new Map<string, AssignmentRow[]>();
  for (const a of activeAssignments) {
    if (!byMedia.has(a.media_id)) byMedia.set(a.media_id, []);
    byMedia.get(a.media_id)!.push(a);
  }

  const reports = [
    ...digital.map((m) => {
      const list = (byMedia.get(m.id) || []).sort(
        (a, b) => new Date(b.start_at || 0).getTime() - new Date(a.start_at || 0).getTime()
      );
      const latest = list[0];
      return {
        id: m.id,
        name: m.name,
        type: 'DIGITAL' as const,
        provincia: m.provincia || undefined,
        url: m.domains?.[0] || undefined,
        whatsapp: m.whatsapp || undefined,
        press_email: m.press_email || undefined,
        hasContract: list.length > 0,
        contractStartDate: latest?.start_at || undefined,
        contractEndDate: latest?.end_at || undefined,
        status: m.status || 'ACTIVE',
      };
    }),
    ...traditional.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.media_type as 'TV' | 'RADIO',
      provincia: t.provincia || undefined,
      channel: t.channel || undefined,
      schedule: t.schedule || undefined,
      hasContract: false,
      status: t.status || 'ACTIVE',
    })),
  ];

  res.json(reports);
});

emailHistoryRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'e.company_id');
  const rows = db
    .prepare(
      `SELECT e.*, m.name AS media_name, ns.title AS submission_title, u.full_name AS sender_name
       FROM email_history e
       LEFT JOIN media m ON m.id = e.media_id
       LEFT JOIN news_submissions ns ON ns.id = e.news_submission_id
       LEFT JOIN users u ON u.id = e.sent_by
       WHERE ${scope.sql}
       ORDER BY e.sent_at DESC LIMIT 2000`
    )
    .all(...scope.params) as Record<string, unknown>[];

  res.json(
    rows.map((r) => {
      const { media_name, submission_title, sender_name, metadata, ...rest } = r;
      let meta: unknown = {};
      try {
        meta = JSON.parse(String(metadata || '{}'));
      } catch {
        meta = {};
      }
      return {
        ...rest,
        metadata: meta,
        media: media_name ? { name: media_name } : null,
        news_submission: submission_title ? { title: submission_title } : null,
        sender: sender_name ? { full_name: sender_name } : null,
      };
    })
  );
});

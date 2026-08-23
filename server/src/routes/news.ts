import { Router } from 'express';
import multer from 'multer';
import { db } from '../db.js';
import { requireAuth, scopeSql, companyForInsert } from '../auth.js';
import { HttpError, uuid, nowIso, requireString, optionalString, oneOf, toInt, toJson, mapRow, mapRows, asyncHandler } from '../utils.js';
import { verifyNews } from '../services/newsVerifier.js';
import { sendNewsEmail, smtpConfigured } from '../services/mailer.js';
import { makeStorage, uploadLimits, publicUrlFor } from './uploads.js';

export const newsRouter = Router();
newsRouter.use(requireAuth);

const VERIFICATION_BOOLS = [
  'verified', 'verified_on_website', 'verified_on_instagram', 'verified_on_twitter', 'verified_on_youtube', 'verified_on_tiktok',
];

function getScoped(req: import('express').Request, id: string) {
  const scope = scopeSql(req, 'company_id');
  const row = db.prepare(`SELECT * FROM news WHERE id = ? AND ${scope.sql}`).get(id, ...scope.params) as Record<string, unknown> | undefined;
  if (!row) throw new HttpError(404, 'Noticia no encontrada');
  return row;
}

newsRouter.get('/', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  res.json(db.prepare(`SELECT * FROM news WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params));
});

newsRouter.post('/', (req, res) => {
  const title = requireString(req.body?.title, 'title');
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `INSERT INTO news (id, company_id, title, verification_status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'PENDING', ?, ?, ?)`
  ).run(id, companyForInsert(req, req.body?.company_id), title, req.user!.id, now, now);
  res.status(201).json(db.prepare('SELECT * FROM news WHERE id = ?').get(id));
});

newsRouter.put('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  const title = requireString(req.body?.title, 'title');
  db.prepare('UPDATE news SET title = ?, updated_at = ? WHERE id = ?').run(title, nowIso(), existing.id);
  res.json(db.prepare('SELECT * FROM news WHERE id = ?').get(existing.id));
});

newsRouter.delete('/:id', (req, res) => {
  const existing = getScoped(req, req.params.id);
  db.prepare('DELETE FROM news WHERE id = ?').run(existing.id); // verifications cascade
  res.json({ ok: true });
});

interface MediaForVerify {
  id: string; name: string; sitemap_url: string | null; domains: string[];
  instagram_url: string | null; twitter_url: string | null; youtube_url: string | null; tiktok_url: string | null;
}

const upsertVerification = db.prepare(
  `INSERT INTO news_verification (id, news_id, media_id, news_url, verified, verified_at, verification_method,
     verified_on_website, website_url, verified_on_instagram, instagram_url, verified_on_twitter, twitter_url,
     verified_on_youtube, youtube_url, verified_on_tiktok, tiktok_url, created_at, updated_at)
   VALUES (@id, @news_id, @media_id, @news_url, @verified, @verified_at, @verification_method,
     @verified_on_website, @website_url, @verified_on_instagram, @instagram_url, @verified_on_twitter, @twitter_url,
     @verified_on_youtube, @youtube_url, @verified_on_tiktok, @tiktok_url, @created_at, @updated_at)
   ON CONFLICT(news_id, media_id) WHERE news_id IS NOT NULL DO UPDATE SET
     news_url = excluded.news_url, verified = excluded.verified, verified_at = excluded.verified_at,
     verification_method = excluded.verification_method,
     verified_on_website = excluded.verified_on_website, website_url = excluded.website_url,
     verified_on_instagram = excluded.verified_on_instagram, instagram_url = excluded.instagram_url,
     verified_on_twitter = excluded.verified_on_twitter, twitter_url = excluded.twitter_url,
     verified_on_youtube = excluded.verified_on_youtube, youtube_url = excluded.youtube_url,
     verified_on_tiktok = excluded.verified_on_tiktok, tiktok_url = excluded.tiktok_url,
     updated_at = excluded.updated_at`
);

/** Run the verification against every active media outlet of the company. */
newsRouter.post(
  '/:id/verify',
  asyncHandler(async (req, res) => {
    const news = getScoped(req, req.params.id);
    db.prepare('UPDATE news SET verification_status = ?, updated_at = ? WHERE id = ?').run('IN_PROGRESS', nowIso(), news.id);

    const scope = scopeSql(req, 'company_id');
    const mediaList = mapRows<MediaForVerify>(
      db
        .prepare(`SELECT id, name, sitemap_url, domains, instagram_url, twitter_url, youtube_url, tiktok_url FROM media WHERE status = 'ACTIVE' AND ${scope.sql} ORDER BY name`)
        .all(...scope.params) as Record<string, unknown>[],
      { json: ['domains'] }
    );

    const results = [];
    for (const media of mediaList) {
      try {
        const r = await verifyNews({
          newsTitle: String(news.title),
          sitemapUrl: media.sitemap_url,
          domains: media.domains,
          socialMediaUrls: {
            instagram_url: media.instagram_url,
            twitter_url: media.twitter_url,
            youtube_url: media.youtube_url,
            tiktok_url: media.tiktok_url,
          },
        });
        const verified = r.verified_on_website || r.verified_on_instagram || r.verified_on_twitter || r.verified_on_youtube || r.verified_on_tiktok;
        const now = nowIso();
        upsertVerification.run({
          id: uuid(),
          news_id: news.id,
          media_id: media.id,
          news_url: r.website_url,
          verified: toInt(verified),
          verified_at: verified ? now : null,
          verification_method: r.method,
          verified_on_website: toInt(r.verified_on_website),
          website_url: r.website_url,
          verified_on_instagram: toInt(r.verified_on_instagram),
          instagram_url: r.instagram_url,
          verified_on_twitter: toInt(r.verified_on_twitter),
          twitter_url: r.twitter_url,
          verified_on_youtube: toInt(r.verified_on_youtube),
          youtube_url: r.youtube_url,
          verified_on_tiktok: toInt(r.verified_on_tiktok),
          tiktok_url: r.tiktok_url,
          created_at: now,
          updated_at: now,
        });
        results.push({ media_id: media.id, media_name: media.name, verified, verified_at: verified ? now : null, ...r });
      } catch (err) {
        console.error(`Error verificando ${media.name}:`, err);
        results.push({ media_id: media.id, media_name: media.name, verified: false, verified_at: null });
      }
    }

    const now = nowIso();
    db.prepare('UPDATE news SET verification_status = ?, last_verified_at = ?, updated_at = ? WHERE id = ?').run('COMPLETED', now, now, news.id);
    res.json({ news: db.prepare('SELECT * FROM news WHERE id = ?').get(news.id), results });
  })
);

/** Verification results merged with the list of active media. */
newsRouter.get('/:id/verifications', (req, res) => {
  const news = getScoped(req, req.params.id);
  const scope = scopeSql(req, 'company_id');
  const mediaList = db
    .prepare(`SELECT id, name FROM media WHERE status = 'ACTIVE' AND ${scope.sql} ORDER BY name`)
    .all(...scope.params) as { id: string; name: string }[];
  const verifications = mapRows(
    db.prepare('SELECT * FROM news_verification WHERE news_id = ?').all(news.id) as Record<string, unknown>[],
    { bool: VERIFICATION_BOOLS }
  ) as Record<string, unknown>[];
  const byMedia = new Map(verifications.map((v) => [v.media_id as string, v]));

  res.json(
    mediaList.map((m) => {
      const v = byMedia.get(m.id) || {};
      return {
        media_id: m.id,
        media_name: m.name,
        verified: Boolean(v.verified),
        verified_at: (v.verified_at as string | null) || null,
        news_url: (v.news_url as string | null) || undefined,
        verified_on_website: Boolean(v.verified_on_website),
        website_url: (v.website_url as string | null) || undefined,
        verified_on_instagram: Boolean(v.verified_on_instagram),
        instagram_url: (v.instagram_url as string | null) || undefined,
        verified_on_twitter: Boolean(v.verified_on_twitter),
        twitter_url: (v.twitter_url as string | null) || undefined,
        verified_on_youtube: Boolean(v.verified_on_youtube),
        youtube_url: (v.youtube_url as string | null) || undefined,
        verified_on_tiktok: Boolean(v.verified_on_tiktok),
        tiktok_url: (v.tiktok_url as string | null) || undefined,
      };
    })
  );
});

// ---------------------------------------------------------------------------
// Send a news release to media outlets (document + up to 3 images + e-mails)
// ---------------------------------------------------------------------------

const sendUpload = multer({ storage: makeStorage(() => 'news-files'), limits: uploadLimits });
const RECIPIENT_FILTERS = ['ALL', 'WITH_PLACEMENT', 'WITHOUT_PLACEMENT'] as const;

const insertEmail = db.prepare(
  `INSERT INTO email_history (id, company_id, news_submission_id, media_id, recipient_email, recipient_name, subject, status, sent_by, error_message, metadata, sent_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

newsRouter.post(
  '/send',
  sendUpload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'images', maxCount: 3 },
  ]),
  asyncHandler(async (req, res) => {
    const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const document = files.document?.[0];
    const images = files.images || [];
    if (!document) throw new HttpError(400, 'Debe subir un documento (PDF, Word o Texto)');
    if (images.length === 0) throw new HttpError(400, 'Debe subir al menos una imagen');

    const title = requireString(req.body?.title, 'title');
    const description = optionalString(req.body?.description) || '';
    const recipientFilter = oneOf(req.body?.recipientFilter, RECIPIENT_FILTERS, 'recipientFilter', 'ALL');
    const companyId = companyForInsert(req, req.body?.company_id);

    const scope = scopeSql(req, 'company_id');
    let where = `status = 'ACTIVE' AND ${scope.sql}`;
    if (recipientFilter === 'WITH_PLACEMENT') where += ' AND has_ad_placement = 1';
    if (recipientFilter === 'WITHOUT_PLACEMENT') where += ' AND has_ad_placement = 0';
    const recipients = db
      .prepare(`SELECT id, name, press_email FROM media WHERE ${where} ORDER BY name`)
      .all(...scope.params) as { id: string; name: string; press_email: string | null }[];

    const documentUrl = publicUrlFor(document);
    const imageUrls = images.map(publicUrlFor);

    const submissionId = uuid();
    db.prepare(
      `INSERT INTO news_submissions (id, company_id, title, description, document_url, document_type, image_urls, recipient_filter, media_recipients, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      submissionId, companyId, title, description, documentUrl, document.mimetype, toJson(imageUrls),
      recipientFilter, toJson(recipients.map((r) => r.id)), req.user!.id, nowIso()
    );

    let successCount = 0;
    let errorCount = 0;
    const withEmail = recipients.filter((r) => r.press_email);
    const metadata = toJson({ title, description, documentUrl, documentType: document.mimetype, imageCount: imageUrls.length });

    for (const outlet of withEmail) {
      try {
        await sendNewsEmail({
          to: outlet.press_email!,
          toName: outlet.name,
          subject: title,
          title,
          description,
          documentUrl,
          imageUrls,
        });
        insertEmail.run(uuid(), companyId, submissionId, outlet.id, outlet.press_email, outlet.name, title, 'SENT', req.user!.id, null, metadata, nowIso());
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        insertEmail.run(uuid(), companyId, submissionId, outlet.id, outlet.press_email, outlet.name, title, 'FAILED', req.user!.id, message, metadata, nowIso());
        errorCount++;
        console.error(`Error enviando a ${outlet.name}:`, message);
      }
    }

    res.status(201).json({
      submissionId,
      recipients: recipients.length,
      withoutEmail: recipients.length - withEmail.length,
      sent: successCount,
      failed: errorCount,
      smtpConfigured: smtpConfigured(),
    });
  })
);

newsRouter.get('/submissions/list', (req, res) => {
  const scope = scopeSql(req, 'company_id');
  const rows = db.prepare(`SELECT * FROM news_submissions WHERE ${scope.sql} ORDER BY created_at DESC`).all(...scope.params) as Record<string, unknown>[];
  res.json(rows.map((r) => mapRow(r, { json: ['image_urls', 'media_recipients'] })));
});

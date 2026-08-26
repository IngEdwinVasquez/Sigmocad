/**
 * Inserta datos de demostración en todas las tablas para probar la aplicación.
 *   npm run seed:demo -w server        (o SEED_DEMO_DATA=true al arrancar el servidor)
 * Usa la primera empresa existente (o crea "Institución de Ejemplo"). Es idempotente:
 * si ya hay medios de demostración no vuelve a insertarlos.
 */
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { uuid, nowIso, generatePublicKey, toJson, slugify } from './utils.js';
import { analyzeSentiment } from './services/sentiment.js';

export function seedDemoData(log: (msg: string) => void = console.log): boolean {
const now = nowIso();
const daysAgo = (d: number, h = 12, m = 0) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, m, 0, 0);
  return t.toISOString();
};
const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// ----- Empresa ---------------------------------------------------------------
let company = db.prepare('SELECT id, name FROM companies ORDER BY created_at LIMIT 1').get() as { id: string; name: string } | undefined;
if (!company) {
  const id = uuid();
  db.prepare(`INSERT INTO companies (id, name, slug, website_url, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`).run(
    id, 'Institución de Ejemplo', 'institucion-de-ejemplo', 'https://www.ejemplo.gob.do', now, now
  );
  company = { id, name: 'Institución de Ejemplo' };
}
db.prepare('UPDATE companies SET website_url = COALESCE(website_url, ?) WHERE id = ?').run('https://www.ejemplo.gob.do', company.id);
const C = company.id;

if ((db.prepare('SELECT COUNT(*) AS c FROM media WHERE company_id = ?').get(C) as { c: number }).c > 0) {
  log(`La empresa "${company.name}" ya tiene datos de demostración. Nada que hacer.`);
  return false;
}

const admin = db.prepare(`SELECT id FROM users WHERE role = 'SUPER_ADMIN' ORDER BY created_at LIMIT 1`).get() as { id: string };

// ----- Usuarios ---------------------------------------------------------------
const insertUser = db.prepare(
  `INSERT OR IGNORE INTO users (id, email, password_hash, full_name, role, company_id, is_active, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
);
const demoHash = bcrypt.hashSync('demo1234', 10);
const users = [
  ['gerente@ejemplo.gob.do', 'María Gerente', 'ADMIN'],
  ['comunicaciones@ejemplo.gob.do', 'Carlos Comunicador', 'USER'],
  ['prensa@ejemplo.gob.do', 'Ana Prensa', 'USER'],
];
for (const [email, name, role] of users) insertUser.run(uuid(), email, demoHash, name, role, C, now, now);
const editor = db.prepare('SELECT id FROM users WHERE email = ?').get('comunicaciones@ejemplo.gob.do') as { id: string };

// ----- Medios digitales ------------------------------------------------------
const insertMedia = db.prepare(
  `INSERT INTO media (id, company_id, name, public_key, domains, status, has_ad_placement, provincia, twitter_url, instagram_url,
     youtube_url, tiktok_url, sitemap_url, whatsapp, press_email, banner_review_status, publication_confirmed, publication_confirmed_at,
     created_by, created_at, updated_at)
   VALUES (@id, @company_id, @name, @public_key, @domains, @status, @has_ad_placement, @provincia, @twitter_url, @instagram_url,
     @youtube_url, @tiktok_url, @sitemap_url, @whatsapp, @press_email, @banner_review_status, @publication_confirmed, @publication_confirmed_at,
     @created_by, @created_at, @updated_at)`
);
const mediaList = [
  { name: 'Diario Libre', domains: ['diariolibre.com', 'www.diariolibre.com'], provincia: 'Santo Domingo', ad: 1, review: 'APPROVED', pub: 1, sitemap: 'https://www.diariolibre.com/sitemap.xml' },
  { name: 'Listín Diario', domains: ['listindiario.com'], provincia: 'Santo Domingo', ad: 1, review: 'APPROVED', pub: 1, sitemap: 'https://listindiario.com/sitemap.xml' },
  { name: 'El Caribe', domains: ['elcaribe.com.do'], provincia: 'Santo Domingo', ad: 1, review: 'PENDING', pub: 0, sitemap: null },
  { name: 'Noticias SIN', domains: ['noticiassin.com'], provincia: 'Distrito Nacional', ad: 1, review: 'REJECTED', pub: 0, sitemap: null },
  { name: 'El Nuevo Diario', domains: ['elnuevodiario.com.do'], provincia: 'Santo Domingo', ad: 0, review: 'PENDING', pub: 0, sitemap: null },
  { name: 'La Información', domains: ['lainformacion.com.do'], provincia: 'Santiago', ad: 0, review: 'PENDING', pub: 0, sitemap: null },
  { name: 'Periódico Hoy', domains: ['hoy.com.do'], provincia: 'Santo Domingo', ad: 1, review: 'APPROVED', pub: 1, sitemap: null, status: 'PAUSED' },
];
const mediaIds: Record<string, string> = {};
mediaList.forEach((m, i) => {
  const id = uuid();
  mediaIds[m.name] = id;
  const handle = slugify(m.name).replace(/-/g, '');
  insertMedia.run({
    id, company_id: C, name: m.name, public_key: generatePublicKey(), domains: toJson(m.domains),
    status: m.status || 'ACTIVE', has_ad_placement: m.ad, provincia: m.provincia,
    twitter_url: `https://twitter.com/${handle}`, instagram_url: `https://instagram.com/${handle}`,
    youtube_url: i % 2 === 0 ? `https://youtube.com/@${handle}` : null, tiktok_url: i % 3 === 0 ? `https://tiktok.com/@${handle}` : null,
    sitemap_url: m.sitemap, whatsapp: `+1809555${String(1000 + i * 111).slice(0, 4)}`, press_email: `prensa@${m.domains[0]}`,
    banner_review_status: m.review, publication_confirmed: m.pub, publication_confirmed_at: m.pub ? daysAgo(10) : null,
    created_by: admin.id, created_at: daysAgo(30 - i), updated_at: daysAgo(30 - i),
  });
});

// ----- Medios TV y Radio -----------------------------------------------------
const insertTrad = db.prepare(
  `INSERT INTO traditional_media (id, company_id, name, channel, provincia, schedule, media_type, cast_members, cast_twitter, cast_instagram,
     cast_youtube, cast_facebook, cast_tiktok, status, created_by, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const trad = [
  ['El Despertador', 'Color Visión (Canal 9)', 'Santo Domingo', 'Lunes a Viernes 6:00 AM - 9:00 AM', 'TV', 'Roberto Cavada, Jatnna Tavárez', '@robertocavada, @jatnnatavarez'],
  ['Noticias SIN Emisión Estelar', 'Antena 7', 'Santo Domingo', 'Lunes a Viernes 7:00 PM - 8:00 PM', 'TV', 'Alicia Ortega', '@aliciaortegah'],
  ['El Gobierno de la Mañana', 'Z101 FM', 'Santo Domingo', 'Lunes a Viernes 8:00 AM - 12:00 PM', 'RADIO', 'Álvaro Arvelo, Melton Pineda', '@alvaroarvelo, @meltonpineda'],
  ['Matinal', 'La Nota 95.7 FM', 'Santiago', 'Lunes a Viernes 7:00 AM - 10:00 AM', 'RADIO', 'Julio Martínez Pozo', '@juliomartinezpozo'],
  ['Hoy Mismo', 'Telesistema (Canal 11)', 'Santo Domingo', 'Lunes a Viernes 7:00 AM - 10:00 AM', 'TV', 'Ramón Emilio Colombo', '@recolombo', 'PAUSED'],
];
trad.forEach((t, i) =>
  insertTrad.run(uuid(), C, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[6], null, t[6].replace(/@/g, ''), null, t[7] || 'ACTIVE', admin.id, daysAgo(20 - i), daysAgo(20 - i))
);

// ----- Espacios ----------------------------------------------------------------
const insertSlot = db.prepare(
  `INSERT INTO slots (id, media_id, slug, width, height, campaign, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const slotDefs: [string, string, number, number, string | null, string?][] = [
  ['Diario Libre', 'home-banner', 728, 90, 'Verano Seguro'],
  ['Diario Libre', 'sidebar', 300, 250, 'Verano Seguro'],
  ['Diario Libre', 'SLOT-0001', 970, 250, null],
  ['Listín Diario', 'home-banner', 728, 90, 'Verano Seguro'],
  ['Listín Diario', 'article-inline', 300, 250, 'Conectividad Rural'],
  ['El Caribe', 'home-banner', 728, 90, 'Conectividad Rural'],
  ['El Caribe', 'footer', 970, 90, null, 'PAUSED'],
  ['Noticias SIN', 'home-banner', 728, 90, null],
  ['Periódico Hoy', 'home-banner', 728, 90, 'Verano Seguro'],
];
const slotIds: Record<string, string> = {};
slotDefs.forEach((s, i) => {
  const id = uuid();
  slotIds[`${s[0]}|${s[1]}`] = id;
  insertSlot.run(id, mediaIds[s[0]], s[1], s[2], s[3], s[4], s[5] || 'ACTIVE', daysAgo(25 - i), daysAgo(25 - i));
});

// ----- Campañas (creatives) ------------------------------------------------------
const insertCreative = db.prepare(
  `INSERT INTO creatives (id, company_id, name, type, src, src2, html, click_url, width, height, duration_ms, campaign, status, created_by, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const creatives = [
  ['Banner Verano Seguro 728x90', 'IMAGE', 'https://placehold.co/728x90/0ea5e9/ffffff.png?text=Verano+Seguro', null, null, 'https://www.ejemplo.gob.do/verano-seguro', 728, 90, null, 'Verano Seguro'],
  ['Banner Verano Seguro 300x250', 'IMAGE', 'https://placehold.co/300x250/0ea5e9/ffffff.png?text=Verano+Seguro', null, null, 'https://www.ejemplo.gob.do/verano-seguro', 300, 250, null, 'Verano Seguro'],
  ['GIF Conectividad Rural', 'GIF', 'https://placehold.co/728x90/16a34a/ffffff.gif?text=Conectividad+Rural', null, null, 'https://www.ejemplo.gob.do/conectividad', 728, 90, null, 'Conectividad Rural'],
  ['Spot Conectividad Rural', 'VIDEO', 'https://www.w3schools.com/html/mov_bbb.mp4', null, null, 'https://www.ejemplo.gob.do/conectividad', 300, 250, 10000, 'Conectividad Rural'],
  ['HTML Transparencia', 'HTML', null, null, '<div style="font-family:sans-serif;background:#1e293b;color:#fff;width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center"><div><strong>Portal de Transparencia</strong><br><small>Consulta la información pública</small></div></div>', 'https://www.ejemplo.gob.do/transparencia', 728, 90, null, 'Transparencia'],
  ['Banner Navidad 2025 (pausado)', 'IMAGE', 'https://placehold.co/728x90/dc2626/ffffff.png?text=Navidad', null, null, 'https://www.ejemplo.gob.do/navidad', 728, 90, null, 'Navidad', 'PAUSED'],
];
const creativeIds: string[] = [];
creatives.forEach((c, i) => {
  const id = uuid();
  creativeIds.push(id);
  insertCreative.run(id, C, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], c[9], c[10] || 'ACTIVE', editor.id, daysAgo(22 - i), daysAgo(22 - i));
});

// ----- Asignaciones ---------------------------------------------------------------
const insertAssignment = db.prepare(
  `INSERT INTO assignments (id, slot_id, creative_id, is_active, weight, start_at, end_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const assignmentDefs: [string, number, number, number, string | null, string | null][] = [
  ['Diario Libre|home-banner', 0, 1, 3, daysAgo(20), daysAgo(-40)],
  ['Diario Libre|home-banner', 4, 1, 1, null, null],
  ['Diario Libre|sidebar', 1, 1, 1, daysAgo(20), daysAgo(-40)],
  ['Diario Libre|SLOT-0001', 5, 0, 1, daysAgo(60), daysAgo(-30)],
  ['Listín Diario|home-banner', 0, 1, 2, daysAgo(15), daysAgo(-45)],
  ['Listín Diario|article-inline', 3, 1, 1, daysAgo(10), null],
  ['El Caribe|home-banner', 2, 1, 1, daysAgo(10), daysAgo(-20)],
  ['Noticias SIN|home-banner', 4, 0, 1, null, null],
  ['Periódico Hoy|home-banner', 0, 1, 1, daysAgo(30), daysAgo(-10)],
];
const assignmentInfo: { slotId: string; creativeId: string; mediaId: string }[] = [];
assignmentDefs.forEach((a, i) => {
  const slotId = slotIds[a[0]];
  insertAssignment.run(uuid(), slotId, creativeIds[a[1]], a[2], a[3], a[4], a[5], daysAgo(18 - i), daysAgo(18 - i));
  if (a[2]) assignmentInfo.push({ slotId, creativeId: creativeIds[a[1]], mediaId: mediaIds[a[0].split('|')[0]] });
});

// ----- Métricas (últimos 14 días) ----------------------------------------------------
const insertMetric = db.prepare(
  `INSERT INTO metrics (media_id, slot_id, creative_id, type, user_agent, ip, referrer, country, city, region, language, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const agents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/17.5',
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Tablet Safari/604.1',
];
const geos: [string, string, string][] = [
  ['Dominican Republic', 'Santo Domingo', 'Distrito Nacional'],
  ['Dominican Republic', 'Santiago de los Caballeros', 'Santiago'],
  ['Dominican Republic', 'La Romana', 'La Romana'],
  ['Dominican Republic', 'Puerto Plata', 'Puerto Plata'],
  ['United States', 'New York', 'New York'],
  ['United States', 'Miami', 'Florida'],
  ['Spain', 'Madrid', 'Madrid'],
  ['Puerto Rico', 'San Juan', 'San Juan'],
];
const insertMetrics = db.transaction(() => {
  let total = 0;
  for (let d = 13; d >= 0; d--) {
    const impressions = rand(60, 180);
    for (let i = 0; i < impressions; i++) {
      const a = pick(assignmentInfo);
      const geo = Math.random() < 0.8 ? geos[rand(0, 3)] : geos[rand(4, 7)];
      const ip = `${rand(100, 200)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`;
      const ts = daysAgo(d, rand(6, 23), rand(0, 59));
      insertMetric.run(a.mediaId, a.slotId, a.creativeId, 'IMPRESSION', pick(agents), ip, 'https://www.ejemplo.com/', geo[0], geo[1], geo[2], 'es', ts);
      total++;
      if (Math.random() < 0.06) {
        insertMetric.run(a.mediaId, a.slotId, a.creativeId, 'CLICK', pick(agents), ip, 'https://www.ejemplo.com/', geo[0], geo[1], geo[2], 'es', ts);
        total++;
      }
    }
  }
  return total;
});
const metricsCount = insertMetrics();

// ----- Noticias y verificaciones -------------------------------------------------------
const insertNews = db.prepare(
  `INSERT INTO news (id, company_id, title, verification_status, last_verified_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertVerification = db.prepare(
  `INSERT INTO news_verification (id, news_id, media_id, news_url, verified, verified_at, verification_method, verified_on_website, website_url,
     verified_on_instagram, instagram_url, verified_on_twitter, twitter_url, verified_on_youtube, youtube_url, verified_on_tiktok, tiktok_url, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const newsItems: [string, string, number][] = [
  ['Institución de Ejemplo lanza campaña Verano Seguro en todo el país', 'COMPLETED', 5],
  ['Programa Conectividad Rural llevará internet a 200 comunidades', 'COMPLETED', 3],
  ['Nuevo portal de transparencia facilita el acceso a la información pública', 'PENDING', 1],
  ['Firma de acuerdo con universidades para becas tecnológicas', 'PENDING', 0],
];
newsItems.forEach((n, i) => {
  const id = uuid();
  insertNews.run(id, C, n[0], n[1], n[1] === 'COMPLETED' ? daysAgo(n[2]) : null, editor.id, daysAgo(n[2] + 1), daysAgo(n[2]));
  if (n[1] === 'COMPLETED') {
    mediaList.slice(0, 6).forEach((m, j) => {
      const web = j < 3 + i;
      const ig = j % 2 === 0 && web;
      const tw = j % 3 !== 2 && web;
      const domain = m.domains[0];
      const path = slugify(n[0]).slice(0, 50);
      insertVerification.run(
        uuid(), id, mediaIds[m.name], web ? `https://${domain}/${path}` : null, web || ig || tw ? 1 : 0, web || ig || tw ? daysAgo(n[2]) : null,
        web ? (j % 2 ? 'SITEMAP' : 'DOMAIN_SEARCH') : 'NONE', web ? 1 : 0, web ? `https://${domain}/${path}` : null,
        ig ? 1 : 0, ig ? `https://instagram.com/${slugify(m.name).replace(/-/g, '')}` : null,
        tw ? 1 : 0, tw ? `https://twitter.com/${slugify(m.name).replace(/-/g, '')}` : null,
        0, null, 0, null, daysAgo(n[2]), daysAgo(n[2])
      );
    });
  }
});

// ----- Envíos de noticias e historial de correos ----------------------------------------
const insertSubmission = db.prepare(
  `INSERT INTO news_submissions (id, company_id, title, description, document_url, document_type, image_urls, recipient_filter, media_recipients, created_by, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertEmail = db.prepare(
  `INSERT INTO email_history (id, company_id, news_submission_id, media_id, recipient_email, recipient_name, subject, status, sent_by, error_message, metadata, sent_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const submissions: [string, string, number, string][] = [
  ['Nota de prensa: Campaña Verano Seguro', 'Adjuntamos la nota de prensa oficial y material gráfico de la campaña Verano Seguro.', 6, 'ALL'],
  ['Nota de prensa: Conectividad Rural', 'Material informativo sobre el programa Conectividad Rural.', 4, 'WITH_PLACEMENT'],
  ['Convocatoria: rueda de prensa becas tecnológicas', 'Invitación a la rueda de prensa del próximo jueves.', 1, 'ALL'],
];
submissions.forEach((s, i) => {
  const id = uuid();
  const recipients = mediaList.filter((m) => s[3] === 'ALL' || m.ad === 1);
  insertSubmission.run(
    id, C, s[0], s[1], `https://www.ejemplo.gob.do/docs/nota-${i + 1}.pdf`, 'application/pdf',
    toJson([`https://placehold.co/800x600.png?text=Imagen+${i + 1}`]), s[3], toJson(recipients.map((m) => mediaIds[m.name])), editor.id, daysAgo(s[2])
  );
  recipients.forEach((m, j) => {
    const failed = (i + j) % 5 === 4;
    insertEmail.run(
      uuid(), C, id, mediaIds[m.name], `prensa@${m.domains[0]}`, m.name, s[0], failed ? 'FAILED' : 'SENT', editor.id,
      failed ? 'Connection timeout: smtp.hostinger.com' : null,
      toJson({ title: s[0], description: s[1], imageCount: 1 }), daysAgo(s[2], 9, 15 + j)
    );
  });
});

// ----- Monitoreo: palabras clave, fuentes y artículos ---------------------------------------
const insertKeyword = db.prepare('INSERT INTO monitoring_keywords (id, company_id, keyword, is_active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)');
['Institución de Ejemplo', 'Verano Seguro', 'Conectividad Rural', 'telecomunicaciones', '"portal de transparencia"', 'becas'].forEach((k, i) =>
  insertKeyword.run(uuid(), C, k, i === 5 ? 0 : 1, admin.id, daysAgo(15 - i))
);
const insertFeed = db.prepare('INSERT INTO rss_feeds (id, company_id, name, url, is_active, created_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)');
insertFeed.run(uuid(), C, 'Diario Libre - Portada', 'https://www.diariolibre.com/rss/portada.xml', admin.id, daysAgo(12));
insertFeed.run(uuid(), C, 'Listín Diario', 'https://listindiario.com/rss/portada', admin.id, daysAgo(12));

const insertArticle = db.prepare(
  `INSERT INTO monitored_articles
     (id, company_id, title, description, url, source, published_at, discovered_at, matched_keywords,
      sentiment, sentiment_score, sentiment_auto, sentiment_notes, read_status, platform)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
// Sentimiento explícito = calificado manualmente por un usuario (sentiment_auto = 0).
// Sentimiento null = la noticia llega sin calificar y el análisis automático la completa al iniciar el servidor.
const articles: [string, string, string, string[], string | null, string | null, number, number][] = [
  ['Institución de Ejemplo inicia la campaña Verano Seguro con operativos en playas', 'La institución desplegó brigadas informativas en los principales balnearios del país.', 'Diario Libre', ['Institución de Ejemplo', 'Verano Seguro'], 'EXCELLENT', 'Cobertura amplia y positiva, con fotos del operativo.', 1, 5],
  ['Conectividad Rural: comunidades de Elías Piña reciben internet por primera vez', 'El programa alcanza su primera meta con 40 comunidades conectadas.', 'Listín Diario', ['Conectividad Rural'], 'GOOD', null, 1, 4],
  ['Usuarios se quejan de lentitud en el portal de transparencia', 'Varios ciudadanos reportaron dificultades para descargar documentos.', 'El Caribe', ['"portal de transparencia"'], 'BAD', 'Responder con nota aclaratoria y revisar servidores.', 1, 3],
  ['Sector telecomunicaciones creció 4.2 % en el primer semestre', 'El informe destaca la inversión en redes de fibra óptica.', 'El Nuevo Diario', ['telecomunicaciones'], 'NEUTRAL', null, 1, 2],
  ['Opinión: ¿Es suficiente la campaña Verano Seguro?', 'Columna de análisis sobre el alcance de la campaña.', 'Noticias SIN', ['Verano Seguro'], null, null, 0, 1],
  ['Anuncian segunda fase del programa Conectividad Rural para el norte', 'Incluirá Santiago, Puerto Plata y Montecristi.', 'La Información', ['Conectividad Rural'], null, null, 0, 0],
];
articles.forEach((a, i) =>
  insertArticle.run(
    uuid(), C, a[0], a[1], `https://www.${slugify(a[2]).replace(/-/g, '')}.com.do/${slugify(a[0]).slice(0, 60)}-${i}`, a[2],
    daysAgo(a[7], 8), daysAgo(a[7], 8, 30), toJson(a[3]), a[4], null, 0, a[5], a[6], 'RSS'
  )
);

// Un par de menciones en redes sociales, como si ya se hubieran encontrado con "Buscar en Redes Sociales".
const socialMentions: [string, string, string, string, string[], number][] = [
  [
    'Excelente iniciativa de Verano Seguro, felicito a la institución por el trabajo en las playas',
    'REDDIT', 'https://www.reddit.com/r/republicadominicana/comments/demo-verano-seguro', 'Reddit r/republicadominicana',
    ['Verano Seguro'], 2,
  ],
  [
    'Resumen del programa Conectividad Rural: avances y próximos pasos',
    'YOUTUBE', 'https://www.youtube.com/watch?v=demo-conectividad-rural', 'YouTube · Canal Ciudadano',
    ['Conectividad Rural'], 1,
  ],
];
socialMentions.forEach((m, i) => {
  const sentiment = analyzeSentiment(m[0]);
  insertArticle.run(
    uuid(), C, m[0], null, m[2], m[3], daysAgo(m[5], 10 + i), daysAgo(m[5], 10 + i), toJson(m[4]),
    sentiment.label, sentiment.score, 1, null, 0, m[1]
  );
});

log(`Datos de demostración insertados para "${company.name}":`);
log(`  usuarios: ${users.length} (contraseña "demo1234") · medios digitales: ${mediaList.length} · TV/Radio: ${trad.length}`);
log(`  espacios: ${slotDefs.length} · campañas: ${creatives.length} · asignaciones: ${assignmentDefs.length} · métricas: ${metricsCount}`);
log(`  noticias: ${newsItems.length} · envíos: ${submissions.length} · palabras clave: 6 · fuentes RSS: 2 · artículos: ${articles.length}`);
return true;
}

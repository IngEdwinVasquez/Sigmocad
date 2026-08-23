import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { initDatabase } from './db.js';
import { HttpError } from './utils.js';
import { startRssPoller } from './services/monitoring.js';

import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { companiesRouter, publicCompaniesRouter } from './routes/companies.js';
import { uploadsRouter } from './routes/uploads.js';
import { mediaRouter } from './routes/media.js';
import { slotsRouter } from './routes/slots.js';
import { creativesRouter } from './routes/creatives.js';
import { assignmentsRouter } from './routes/assignments.js';
import { metricsRouter, dashboardRouter } from './routes/metrics.js';
import { traditionalMediaRouter } from './routes/traditionalMedia.js';
import { reportsRouter, emailHistoryRouter } from './routes/reports.js';
import { newsRouter } from './routes/news.js';
import { monitoringRouter } from './routes/monitoring.js';
import { publicRouter, toolsRouter } from './routes/public.js';

initDatabase();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(
  cors({
    origin: (origin, cb) => {
      // same-origin requests, curl, and publisher sites (public endpoints) are allowed
      if (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) return cb(null, true);
      return cb(null, origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'));
    },
    credentials: false,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: ['text/plain'], limit: '1mb' })); // navigator.sendBeacon payloads

// Uploaded files
fs.mkdirSync(config.uploadDir, { recursive: true });
app.use(
  '/uploads',
  (_req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    next();
  },
  express.static(config.uploadDir, { maxAge: '7d', index: false })
);

// Public ad-server endpoints (/embed, /e/:key.js, /click, /impression, /api/rss-webhook)
app.use(publicRouter);

// API
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/public/companies', publicCompaniesRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/creatives', creativesRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/traditional-media', traditionalMediaRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/email-history', emailHistoryRouter);
app.use('/api/news', newsRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/tools', toolsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Production: serve the built React client
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) {
  app.use(express.static(config.clientDist, { index: false }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(config.clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) =>
    res.type('text').send('SIGMOCAD API en ejecución. Construya el cliente (npm run build) para servir la aplicación desde aquí.')
  );
}

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  const anyErr = err as { code?: string; message?: string; type?: string };
  if (anyErr?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `El archivo supera el tamaño máximo (${config.maxUploadMb} MB)` });
  }
  if (anyErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: anyErr?.message || 'Error interno del servidor' });
});

app.listen(config.port, () => {
  console.log(`SIGMOCAD server: ${config.publicUrl} (puerto ${config.port}, ${config.isProduction ? 'producción' : 'desarrollo'})`);
  console.log(`Base de datos: ${config.dbPath}`);
  if (!config.smtp.configured) console.log('SMTP no configurado: el envío de correos a medios estará deshabilitado.');
  startRssPoller();
});

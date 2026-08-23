import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../utils.js';

/** Allowed "buckets" (sub-folders of the upload directory). */
export const BUCKETS = ['company-logos', 'campanas', 'news-files'] as const;
export type Bucket = (typeof BUCKETS)[number];

const ALLOWED_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif',
  'mp4', 'webm', 'ogg', 'mov',
  'pdf', 'doc', 'docx', 'txt',
]);

function safeExt(originalName: string): string {
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  if (!ALLOWED_EXT.has(ext)) throw new HttpError(400, `Tipo de archivo no permitido: .${ext || '?'}`);
  return ext;
}

export function makeStorage(bucketResolver: (req: import('express').Request) => Bucket) {
  return multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        const dir = path.join(config.uploadDir, bucketResolver(req));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (err) {
        cb(err as Error, '');
      }
    },
    filename: (_req, file, cb) => {
      try {
        const ext = safeExt(file.originalname);
        const base = path
          .basename(file.originalname, path.extname(file.originalname))
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40);
        cb(null, `${Date.now()}-${randomBytes(4).toString('hex')}-${base}.${ext}`);
      } catch (err) {
        cb(err as Error, '');
      }
    },
  });
}

export const uploadLimits = { fileSize: config.maxUploadMb * 1024 * 1024 };

/** Absolute public URL for a stored file. */
export function publicUrlFor(file: Express.Multer.File): string {
  const rel = path.relative(config.uploadDir, file.path).split(path.sep).join('/');
  return `${config.publicUrl}/uploads/${rel}`;
}

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth);

const genericUpload = multer({
  storage: makeStorage((req) => {
    const bucket = req.params.bucket as Bucket;
    if (!BUCKETS.includes(bucket)) throw new HttpError(400, 'Bucket inválido');
    return bucket;
  }),
  limits: uploadLimits,
});

/** POST /api/uploads/:bucket  (multipart field "file") → { url, name, size, type } */
uploadsRouter.post('/:bucket', genericUpload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'No se recibió ningún archivo');
  res.status(201).json({
    url: publicUrlFor(req.file),
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
  });
});

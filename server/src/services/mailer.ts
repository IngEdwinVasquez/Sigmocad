import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../config.js';
import { escapeHtml } from '../utils.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!config.smtp.configured) {
    throw new Error('SMTP no configurado. Defina SMTP_HOST, SMTP_USER y SMTP_PASS en el archivo .env del servidor');
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export interface NewsEmailInput {
  to: string;
  toName: string;
  subject: string;
  title: string;
  description: string;
  documentUrl: string | null;
  imageUrls: string[];
}

export function buildNewsEmailHtml(input: NewsEmailInput): string {
  const description = input.description
    ? `<p>${escapeHtml(input.description).replace(/\n/g, '<br>')}</p>`
    : '';
  const document = input.documentUrl
    ? `<div style="margin: 20px 0;"><a href="${input.documentUrl}" class="button">📄 Descargar Documento</a></div>`
    : '';
  const images =
    input.imageUrls.length > 0
      ? `<h3>Imágenes adjuntas:</h3><div class="images">${input.imageUrls
          .map((url) => `<img src="${url}" alt="Imagen">`)
          .join('')}</div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none; }
    .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 10px 0; }
    .images { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
    .images img { max-width: 180px; height: auto; border-radius: 4px; border: 1px solid #e2e8f0; }
    h1 { margin: 0; font-size: 24px; }
    h2 { color: #1e293b; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>📰 Nueva Noticia de SIGMOCAD</h1></div>
    <div class="content">
      <h2>${escapeHtml(input.title)}</h2>
      ${description}
      ${document}
      ${images}
    </div>
    <div class="footer">
      <p style="margin: 5px 0; color: #64748b; font-size: 14px;"><strong>SIGMOCAD</strong> - Sistema de Gestión y Monitoreo de Campañas Publicitarias</p>
      <p style="margin: 5px 0; color: #94a3b8; font-size: 12px;">${escapeHtml(config.smtp.user || '')}</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendNewsEmail(input: NewsEmailInput): Promise<void> {
  const transport = getTransporter();
  await transport.sendMail({
    from: config.smtp.from,
    to: input.toName ? `"${input.toName.replace(/"/g, '')}" <${input.to}>` : input.to,
    subject: input.subject,
    html: buildNewsEmailHtml(input),
  });
}

export const smtpConfigured = () => config.smtp.configured;

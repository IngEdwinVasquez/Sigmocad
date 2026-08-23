import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface EmailRequest {
  to: string;
  toName: string;
  subject: string;
  title: string;
  description: string;
  documentUrl: string;
  documentType: string;
  imageUrls: string[];
  companyId?: string;
  newsSubmissionId?: string;
  mediaId?: string;
  sentBy?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const emailData: EmailRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // SMTP Configuration
    const smtpConfig = {
      hostname: "smtp.hostinger.com",
      port: 465,
      username: "info@sigmocad.com",
      password: "6t=+bS?#ax#E",
    };

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
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
    <div class="header">
      <h1>📰 Nueva Noticia de SIGMOCAD</h1>
    </div>
    <div class="content">
      <h2>${emailData.title}</h2>
      ${emailData.description ? `<p>${emailData.description.replace(/\n/g, '<br>')}</p>` : ''}
      
      <div style="margin: 20px 0;">
        <a href="${emailData.documentUrl}" class="button">📄 Descargar Documento</a>
      </div>

      ${emailData.imageUrls.length > 0 ? `
        <h3>Imágenes adjuntas:</h3>
        <div class="images">
          ${emailData.imageUrls.map(url => `<img src="${url}" alt="Imagen">`).join('')}
        </div>
      ` : ''}
    </div>
    <div class="footer">
      <p style="margin: 5px 0; color: #64748b; font-size: 14px;">
        <strong>SIGMOCAD</strong> - Sistema de Gestión y Monitoreo de Campañas Publicitarias
      </p>
      <p style="margin: 5px 0; color: #94a3b8; font-size: 12px;">
        info@sigmocad.com
      </p>
    </div>
  </div>
</body>
</html>
    `;

    // Build email message in RFC 5322 format
    const boundary = `----=_Part_${Date.now()}`;
    const message = [
      `From: SIGMOCAD <${smtpConfig.username}>`,
      `To: ${emailData.toName} <${emailData.to}>`,
      `Subject: ${emailData.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      emailHtml,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    // Connect to SMTP server and send email
    const conn = await Deno.connect({
      hostname: smtpConfig.hostname,
      port: smtpConfig.port,
      transport: "tcp",
    });

    // Start TLS handshake
    const tlsConn = await Deno.startTls(conn, {
      hostname: smtpConfig.hostname,
    });

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const reader = tlsConn.readable.getReader();
    const writer = tlsConn.writable.getWriter();

    // Helper to read response
    const readResponse = async () => {
      const { value } = await reader.read();
      return decoder.decode(value);
    };

    // Helper to send command
    const sendCommand = async (cmd: string) => {
      await writer.write(encoder.encode(cmd + '\r\n'));
    };

    // SMTP conversation
    await readResponse(); // Read greeting
    await sendCommand(`EHLO ${smtpConfig.hostname}`);
    await readResponse(); // Read EHLO response

    // Login
    await sendCommand('AUTH LOGIN');
    await readResponse();
    await sendCommand(btoa(smtpConfig.username));
    await readResponse();
    await sendCommand(btoa(smtpConfig.password));
    await readResponse();

    // Send email
    await sendCommand(`MAIL FROM:<${smtpConfig.username}>`);
    await readResponse();
    await sendCommand(`RCPT TO:<${emailData.to}>`);
    await readResponse();
    await sendCommand('DATA');
    await readResponse();
    await sendCommand(message);
    await sendCommand('.');
    await readResponse();

    // Quit
    await sendCommand('QUIT');
    await readResponse();

    // Close connection
    reader.releaseLock();
    writer.releaseLock();
    await tlsConn.close();

    // Log successful email to history
    if (emailData.companyId) {
      await supabase.from('email_history').insert({
        company_id: emailData.companyId,
        news_submission_id: emailData.newsSubmissionId || null,
        media_id: emailData.mediaId || null,
        recipient_email: emailData.to,
        recipient_name: emailData.toName,
        subject: emailData.subject,
        status: 'SENT',
        sent_by: emailData.sentBy || null,
        metadata: {
          title: emailData.title,
          description: emailData.description,
          documentUrl: emailData.documentUrl,
          documentType: emailData.documentType,
          imageCount: emailData.imageUrls.length,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email sent successfully' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error sending email:', error);

    // Log failed email to history
    const emailData: EmailRequest = await req.clone().json();
    if (emailData.companyId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from('email_history').insert({
        company_id: emailData.companyId,
        news_submission_id: emailData.newsSubmissionId || null,
        media_id: emailData.mediaId || null,
        recipient_email: emailData.to,
        recipient_name: emailData.toName,
        subject: emailData.subject,
        status: 'FAILED',
        sent_by: emailData.sentBy || null,
        error_message: error.message,
        metadata: {
          title: emailData.title,
          description: emailData.description,
          documentUrl: emailData.documentUrl,
          documentType: emailData.documentType,
          imageCount: emailData.imageUrls?.length || 0,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
# SIGMOCAD

**Sistema de Gestión de Medios y Contenido Publicitario Digital.**
Plataforma para administrar medios (digitales, TV y radio), espacios publicitarios, campañas, asignaciones, métricas de impresiones/clics, verificación y envío de noticias, y monitoreo de medios por RSS.

Versión 2: sin dependencias de servicios externos. Todo corre en un solo proceso Node.

| Capa | Tecnología |
|------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| Base de datos | SQLite (better-sqlite3) — archivo local, sin servidor |
| Autenticación | Propia: JWT + bcrypt, roles `SUPER_ADMIN` / `ADMIN` / `USER` |
| Archivos | Subida local con multer, servidos desde `/uploads` |
| Correo | SMTP vía nodemailer (opcional) |
| RSS | Sondeo periódico con rss-parser + webhook externo |

## Estructura del proyecto

```
SIGMOCAD/
├── package.json          # workspaces: client + server, scripts dev/build/start
├── client/               # Aplicación React (Vite)
│   ├── src/lib/api.ts    # Cliente HTTP (token JWT + empresa seleccionada)
│   ├── src/lib/auth-context.tsx
│   ├── src/pages/        # Dashboard, Medios, Espacios, Campañas, Asignaciones, Métricas,
│   │                     # Código, Noticias, Monitoreo, Reportes, Correos, Empresas, Usuarios
│   └── src/components/
└── server/               # API Express + SQLite
    ├── .env.example      # Variables de entorno (copiar a .env)
    ├── data/             # sigmocad.db (se crea automáticamente, ignorado por git)
    ├── uploads/          # Archivos subidos (ignorado por git)
    └── src/
        ├── index.ts      # Arranque, rutas, servido del cliente compilado
        ├── db.ts         # Esquema SQLite + usuario administrador inicial
        ├── auth.ts       # JWT, middleware, aislamiento por empresa
        ├── routes/       # auth, users, companies, media, slots, creatives, assignments,
        │                 # metrics, news, monitoring, reports, uploads, public (ad server)
        └── services/     # mailer, geo, newsVerifier, monitoring (RSS)
```

## Requisitos

- Node.js 20 o superior (probado con Node 24)
- npm 9+

## Instalación y puesta en marcha

```bash
# 1. Dependencias de client y server
npm install

# 2. Configuración del servidor
cp server/.env.example server/.env
#    Edite server/.env: como mínimo cambie JWT_SECRET y ADMIN_PASSWORD

# 3. Desarrollo (API en :4000 y Vite en :5173 con proxy)
npm run dev
```

Abra http://localhost:5173 e inicie sesión con el administrador inicial
(`ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`; por defecto `admin@sigmocad.com` / `Admin123!`).
El usuario solo se crea la primera vez, cuando la base de datos está vacía.

### Producción

```bash
npm run build      # compila client/dist y server/dist
npm start          # Express sirve la API y la aplicación React en PUBLIC_URL
```

En producción defina en `server/.env`:

- `NODE_ENV=production`
- `JWT_SECRET` largo y aleatorio (`openssl rand -hex 32`)
- `PUBLIC_URL` con la URL pública real (se usa en los snippets, archivos y correos)
- `CORS_ORIGINS` si el cliente se sirve desde otro dominio

Con un proxy inverso (nginx, Caddy, IIS) apunte al puerto `PORT` (4000 por defecto).
Para mantener el proceso en ejecución use pm2, systemd o el Programador de tareas de Windows:

```bash
npx pm2 start server/dist/index.js --name sigmocad
```

### Copias de seguridad

Toda la información vive en dos carpetas: `server/data/` (base de datos SQLite) y
`server/uploads/` (logos, campañas y documentos). Respáldelas juntas.

## Variables de entorno (`server/.env`)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor | `4000` |
| `PUBLIC_URL` | URL pública del servidor | `http://localhost:4000` |
| `CORS_ORIGINS` | Orígenes permitidos (coma) | `http://localhost:5173` |
| `JWT_SECRET` | Secreto para firmar sesiones (**obligatorio en producción**) | — |
| `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |
| `ALLOW_PUBLIC_REGISTRATION` | Permitir `/register` público | `false` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Administrador inicial | `admin@sigmocad.com` / `Admin123!` |
| `DB_PATH` | Ruta del archivo SQLite | `data/sigmocad.db` |
| `UPLOAD_DIR` | Carpeta de archivos subidos | `uploads` |
| `MAX_UPLOAD_MB` | Tamaño máximo por archivo | `50` |
| `CLIENT_DIST` | Build del cliente a servir | `../client/dist` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de correos a medios | (deshabilitado) |
| `RSS_POLL_MINUTES` | Intervalo de sondeo RSS (0 = apagado) | `15` |
| `RSS_WEBHOOK_SECRET` | Secreto del webhook `/api/rss-webhook` | (sin secreto) |
| `GEO_LOOKUP` | Geolocalizar IPs con ip-api.com | `true` |

## Usuarios, roles y empresas

El sistema es multiempresa. Cada registro (medios, campañas, noticias, etc.) pertenece a una empresa.

| Rol | Permisos |
|-----|----------|
| `SUPER_ADMIN` | Acceso global. Crea empresas, gestiona todos los usuarios y puede cambiar la empresa activa desde la barra lateral ("Viendo datos de"). |
| `ADMIN` | Gestiona los usuarios y datos de su propia empresa. No puede crear empresas ni otorgar `SUPER_ADMIN`. |
| `USER` | Opera los módulos de su empresa. |

Mantenimiento de usuarios (menú **Administrador → Usuarios**): crear con contraseña, editar nombre/rol/empresa,
restablecer contraseña, activar/desactivar y eliminar. Todos los usuarios pueden cambiar su propia contraseña
desde la barra lateral. No es posible eliminarse, desactivarse ni cambiar el propio rol.

Página de login con marca de la empresa: `http://servidor/?company=<slug>` (el slug se define en **Empresas**).

## Ad server (endpoints públicos)

Los sitios web de los medios integran el código generado en **Código**:

```html
<!-- Opción A: iframe -->
<iframe id="gev-SLOT-0001" width="728" height="90" frameborder="0" scrolling="no"></iframe>
<script>/* carga PUBLIC_URL/embed?publicKey=...&slot=...&format=html en el iframe */</script>

<!-- Opción B: script -->
<div id="gev-SLOT-0001"></div>
<script async src="PUBLIC_URL/e/pk_xxxxxxxx.js" data-slot="SLOT-0001" data-width="728" data-height="90"></script>
```

| Endpoint | Función |
|----------|---------|
| `GET /embed?publicKey=&slot=&format=json\|html` | Devuelve la campaña activa del espacio (rotación por peso, respeta programación y dominios permitidos) |
| `GET /e/:publicKey.js` | Script de integración que renderiza el anuncio y envía la impresión |
| `GET /click?mediaId=&slotId=&creativeId=` | Registra el clic y redirige a la URL de destino |
| `POST /impression` | Registra una impresión (beacon) |
| `POST /api/rss-webhook` | Recibe artículos `{title, description, link, source, pubDate}` desde servicios externos |

## API interna (resumen)

Todas las rutas `/api/*` (salvo `auth/login`, `auth/config`, `public/*` y `rss-webhook`) requieren
`Authorization: Bearer <token>`. Los `SUPER_ADMIN` pueden enviar `X-Company-Id` para fijar la empresa activa.

`/api/auth` · `/api/users` · `/api/companies` · `/api/media` · `/api/slots` · `/api/creatives` ·
`/api/assignments` · `/api/metrics` · `/api/dashboard` · `/api/traditional-media` · `/api/news` ·
`/api/monitoring` (keywords, articles, feeds) · `/api/email-history` · `/api/reports` · `/api/uploads` · `/api/tools`

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor (tsx watch) + cliente (Vite) en paralelo |
| `npm run build` | Compila cliente y servidor |
| `npm start` | Arranca el servidor compilado |
| `npm run typecheck` | Verificación de tipos en ambos paquetes |
| `npm run lint` | ESLint del cliente |

## Migración desde la versión Supabase

La versión anterior usaba Supabase (Postgres, Auth, Storage y Edge Functions). Esta versión reemplaza
cada pieza por un equivalente local; el esquema de datos se conserva (tablas `companies`, `users`,
`media`, `slots`, `creatives`, `assignments`, `metrics`, `news`, `news_verification`, `news_submissions`,
`email_history`, `traditional_media`, `monitoring_keywords`, `monitored_articles`) más `rss_feeds`.
Los datos existentes en Supabase deben exportarse e importarse manualmente en SQLite si se desean conservar;
las contraseñas de Supabase Auth no son transferibles, por lo que los usuarios deben recrearse.

## Licencia

MIT

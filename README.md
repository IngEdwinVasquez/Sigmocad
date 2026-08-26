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

# 3. Desarrollo (API en :4000 y Vite en :5180 con proxy)
npm run dev
```

Abra http://localhost:5180 e inicie sesión con el administrador inicial
(`ADMIN_EMAIL` / `ADMIN_PASSWORD` del `.env`; por defecto `admin@sigmocad.com` / `Admin123!`).
El usuario y una empresa de ejemplo (`SEED_COMPANY_NAME`) solo se crean la primera vez, cuando la base de datos está vacía.

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

### Despliegue en Azure App Service (Linux)

1. Crear **Aplicación web** → Publicar: *Código*, pila *Node 22 LTS*, SO *Linux*, plan F1 (pruebas) o B1 (producción).
2. *Centro de implementación* → GitHub → repositorio y rama `main`. Azure ejecuta `npm install`, `npm run build` y `npm start`.
3. *Configuración → Variables de entorno*, agregar:

| Nombre | Valor |
|--------|-------|
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | `https://<nombre-app>.azurewebsites.net` (o su dominio) |
| `CORS_ORIGINS` | el mismo valor de `PUBLIC_URL` |
| `JWT_SECRET` | cadena aleatoria larga |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | credenciales del primer administrador |
| `DB_PATH` | `/home/data/sigmocad.db` |
| `UPLOAD_DIR` | `/home/uploads` |
| `SQLITE_JOURNAL_MODE` | `DELETE` (el disco `/home` es un recurso compartido de red) |
| `SMTP_*` | credenciales de correo |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |

`/home` persiste entre reinicios y despliegues, por lo que la base de datos y los archivos se conservan.
En el plan F1 la aplicación se suspende tras 20 minutos sin tráfico; para producción use B1 con *Always On*.

### Copias de seguridad

Toda la información vive en dos carpetas: `server/data/` (base de datos SQLite) y
`server/uploads/` (logos, campañas y documentos). Respáldelas juntas.

## Variables de entorno (`server/.env`)

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor | `4000` |
| `PUBLIC_URL` | URL pública del servidor | `http://localhost:4000` |
| `CORS_ORIGINS` | Orígenes permitidos (coma) | `http://localhost:5180` |
| `JWT_SECRET` | Secreto para firmar sesiones (**obligatorio en producción**) | — |
| `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |
| `ALLOW_PUBLIC_REGISTRATION` | Permitir `/register` público | `false` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Administrador inicial | `admin@sigmocad.com` / `Admin123!` |
| `ADMIN_FORCE_PASSWORD` | `true` restablece la contraseña de `ADMIN_EMAIL` a `ADMIN_PASSWORD` en cada arranque (recuperación; volver a `false`) | `false` |
| `SEED_DEMO_DATA` | `true` inserta los datos de demostración al arrancar (idempotente) | `false` |
| `SEED_COMPANY_NAME` | Empresa de ejemplo creada en el primer arranque | `Institución de Ejemplo` |
| `DB_PATH` | Ruta del archivo SQLite | `data/sigmocad.db` |
| `SQLITE_JOURNAL_MODE` | `WAL` (disco local) o `DELETE` (disco de red, Azure App Service) | `WAL` |
| `UPLOAD_DIR` | Carpeta de archivos subidos | `uploads` |
| `MAX_UPLOAD_MB` | Tamaño máximo por archivo | `50` |
| `CLIENT_DIST` | Build del cliente a servir | `../client/dist` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de correos a medios | (deshabilitado) |
| `RSS_POLL_MINUTES` | Intervalo de sondeo RSS (0 = apagado) | `15` |
| `RSS_WEBHOOK_SECRET` | Secreto del webhook `/api/rss-webhook` | (sin secreto) |
| `SOCIAL_REDDIT_ENABLED` | Búsqueda automática en Reddit por palabra clave | `true` |
| `YOUTUBE_API_KEY` | Clave de la API de datos de YouTube (capa gratuita); vacío = deshabilitado | (vacío) |
| `SOCIAL_POLL_MINUTES` | Intervalo de sondeo de redes sociales | `60` |
| `GEO_LOOKUP` | Geolocalizar IPs con ip-api.com | `true` |

## Monitoreo de medios: noticias, sentimiento y redes sociales

El módulo **Monitoreo de Medios** rastrea un tema (definido por palabras clave por empresa) en tres frentes:

1. **Noticias (RSS)** — fuentes RSS propias + webhook externo `POST /api/rss-webhook`, como antes.
2. **Sentimiento automático** — cada noticia o mención se clasifica como Excelente/Buena/Mala/Neutral con un
   analizador léxico en español ([server/src/services/sentiment.ts](server/src/services/sentiment.ts)), sin
   servicios externos. Es heurístico, no un modelo de lenguaje: útil para ver tendencia general, no para
   matices finos. Un usuario puede recalificar cualquier mención manualmente; queda marcada como "Manual" en
   vez de "Automático" y ya no se sobrescribe.
3. **Redes sociales** — usa las mismas palabras clave activas, sin configuración adicional:
   - **Reddit**: búsqueda pública, sin clave. **Reddit bloquea con frecuencia (403) las peticiones desde IPs
     de servidor/datacenter** (protección anti-bots) — funciona de forma oportunista, no garantizada; la app
     lo detecta y lo indica en pantalla en vez de fallar en silencio.
   - **YouTube**: requiere `YOUTUBE_API_KEY` (API oficial de Google, capa gratuita ~10,000 unidades/día).
   - **Twitter/X, Instagram, Facebook, TikTok**: sin acceso gratuito a búsqueda por palabra clave desde 2023.
     La alternativa práctica es generar un feed en [RSS.app](https://rss.app) (de pago) para el perfil o
     búsqueda que interese, y agregar esa URL en **Fuentes RSS** como una fuente más — se integra sin cambios
     de código porque ya es un feed RSS estándar.

El botón **Buscar en Redes Sociales** ejecuta una búsqueda inmediata; además el servidor sondea automáticamente
cada `SOCIAL_POLL_MINUTES`. Los resultados de RSS, Reddit y YouTube comparten la misma lista y se pueden
filtrar por plataforma.

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
| `npm run seed:demo` | Inserta datos de demostración (medios, campañas, métricas, noticias, usuarios `demo1234`) en la primera empresa |
| `npm run typecheck` | Verificación de tipos en ambos paquetes |
| `npm run lint` | ESLint del cliente |

## Licencia

MIT

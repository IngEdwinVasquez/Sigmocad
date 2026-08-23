# Ad Server Platform

A full-stack ad server application built with React, TypeScript, Vite, Tailwind CSS, and Supabase. Manage publishers, ad slots, creatives, and track metrics with real-time delivery.

## Features

- **Authentication**: Email/password authentication with Supabase Auth
- **Media Management**: Create and manage publishers/websites with domain restrictions
- **Slots**: Define ad slots with specific dimensions for each media property
- **Creatives**: Upload images, GIFs, videos, or HTML creatives with Storage integration
- **Assignments**: Link creatives to slots with scheduling and weight-based rotation
- **Metrics**: Track impressions and clicks with dashboard visualization
- **Snippets**: Auto-generated embed codes (Script and Iframe)
- **Playground**: Test your snippets in a live preview environment
- **Edge Functions**: Fast, globally distributed ad delivery via Supabase Edge Functions

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **UI Components**: Custom component library with Radix UI patterns
- **State Management**: React Query (TanStack Query)
- **Charts**: Recharts
- **Backend**: Supabase (Postgres, Auth, Storage, Edge Functions)
- **Validation**: Zod

## Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

## Getting Started

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

The database schema and Edge Functions are already deployed. You just need to configure your local environment:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

### 4. Database Setup

The database schema includes:
- `profiles` - User profiles with roles (ADMIN/EDITOR)
- `media` - Publishers/websites
- `slots` - Ad placement slots
- `creatives` - Ad creative assets
- `assignments` - Creative-to-slot mappings
- `metrics` - Impression and click tracking

All tables have Row Level Security (RLS) enabled for data protection.

### 5. Storage Setup

A public `creatives` bucket is configured in Supabase Storage for uploading ad assets.

### 6. Edge Functions

Four Edge Functions are deployed:
- **embed** - Returns active creative for a given slot
- **e** (ejs) - Generates the JavaScript embed code
- **click** - Tracks clicks and redirects to destination URL
- **impression** - Tracks ad impressions

### 7. Run the Application

Development mode:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Usage Guide

### 1. Create a Media Property

Go to **Media** and click "Add Media":
- Enter a name for your publisher/website
- Optionally add allowed domains (one per line)
- Set status to Active
- A unique public key will be generated automatically

### 2. Add Slots

Go to **Slots** and click "Add Slot":
- Select the media property
- Enter a slug (e.g., "home-banner")
- Set width and height (optional)
- Set status to Active

### 3. Upload Creatives

Go to **Creatives** and click "Add Creative":
- Select creative type (Image, GIF, Video, or HTML)
- Upload files or enter URLs
- Add a click URL (destination when ad is clicked)
- Set dimensions

### 4. Create Assignments

Go to **Assignments** and click "Add Assignment":
- Select a slot
- Select a creative
- Mark as Active
- Set weight (for rotation)
- Optionally schedule with start/end dates

### 5. Get Embed Code

Go to **Snippets**:
- Select your media property and slot
- Copy the generated snippet (Script or Iframe)
- Paste into your website HTML

**Script Tag (Recommended):**
```html
<div id="gev-home-banner"></div>
<script async src="YOUR_SUPABASE_URL/functions/v1/e/YOUR_PUBLIC_KEY.js"
  data-slot="home-banner" data-width="728" data-height="90"></script>
```

**Iframe Tag:**
```html
<iframe
  src="YOUR_SUPABASE_URL/functions/v1/embed?publicKey=YOUR_PUBLIC_KEY&slot=home-banner"
  width="728" height="90" frameborder="0" scrolling="no"></iframe>
```

### 6. Test in Playground

Go to **Playground** to test your snippets in a safe environment before deploying to production.

### 7. Monitor Metrics

Go to **Metrics** to view:
- Total impressions and clicks
- Click-through rate (CTR)
- Daily performance charts
- Export data to CSV

## How It Works

### Ad Delivery Flow

1. Publisher embeds the snippet on their website
2. The script/iframe calls the Edge Function with media public key and slot slug
3. Edge Function validates domain restrictions
4. System finds active assignment for the slot
5. Creative is selected based on schedule and weight
6. Ad is rendered on the page
7. Impression is tracked via beacon
8. When clicked, user is redirected through click tracker

### Caching

- Embed API responses are cached for 30 seconds (max-age)
- Stale-while-revalidate allows serving stale content for up to 5 minutes
- Changes to assignments reflect within 30-60 seconds

### Security Features

- Row Level Security (RLS) on all database tables
- Domain validation for embed requests
- HTML sanitization for HTML creatives
- Authenticated uploads to Storage
- Service role key used only in Edge Functions

## API Endpoints

All Edge Functions are available at:
- `{SUPABASE_URL}/functions/v1/embed` - Get active creative (GET)
- `{SUPABASE_URL}/functions/v1/e/{publicKey}.js` - Embed script (GET)
- `{SUPABASE_URL}/functions/v1/click` - Track click and redirect (GET)
- `{SUPABASE_URL}/functions/v1/impression` - Track impression (POST)

## Development

### Project Structure

```
src/
├── components/
│   ├── ui/              # Reusable UI components
│   └── Layout.tsx       # Main layout with navigation
├── lib/
│   ├── supabase.ts      # Supabase client and types
│   └── auth-context.tsx # Authentication context
├── pages/
│   ├── Auth.tsx         # Login/signup page
│   ├── Dashboard.tsx    # Overview dashboard
│   ├── Media.tsx        # Media management
│   ├── Slots.tsx        # Slots management
│   ├── Creatives.tsx    # Creative management
│   ├── Assignments.tsx  # Assignment management
│   ├── Metrics.tsx      # Analytics dashboard
│   ├── Snippets.tsx     # Embed code generator
│   └── Playground.tsx   # Testing environment
├── App.tsx              # Main app component
└── main.tsx             # App entry point

supabase/
└── functions/
    ├── embed/           # Creative delivery API
    ├── e/               # JavaScript embed generator
    ├── click/           # Click tracker
    └── impression/      # Impression tracker
```

### Type Checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

## Troubleshooting

### Ads not showing up
- Verify the assignment is marked as Active
- Check that both Media and Slot status are Active
- Ensure the creative has a valid src or html content
- Wait 60 seconds for cache to clear after changes

### Domain restrictions
- Make sure the embedding domain matches one in the Media's allowed domains
- Leave domains empty to allow all domains

### Metrics not recording
- Check browser console for errors
- Verify Edge Functions are deployed
- Check network tab for failed requests to impression/click endpoints

## License

MIT

## Support

For issues and questions, please open a GitHub issue.

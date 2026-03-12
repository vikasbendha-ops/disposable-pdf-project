# Disposable PDF Project

## Next.js + Vercel (Single Deployment, No Python)

This repo is now configured so frontend and backend can run under one Vercel project:

- Next.js frontend at repo root (`pages/` + `frontend/src/` UI code)
- Next.js API backend (`pages/api/index.js` + `pages/api/[...path].js`)
- Supabase schema reference at `db/supabase_schema.sql`

### Deploy on Vercel

1. Import this repository as a Vercel project.
2. Keep **Root Directory** as repository root.
3. Build command: `npm run build`
4. Output: Next.js default (leave empty).
5. Add env vars from [`.env.example`](/Users/apple/Downloads/Disposable-pdf-main/.env.example).

Optional frontend env override:

- `NEXT_PUBLIC_BACKEND_URL` (leave empty to use same-origin `/api` on Vercel).

### Authentication + Email Setup (Supabase Auth)

Set these Vercel env vars:

1. `SUPABASE_URL=https://<project-ref>.supabase.co`
2. `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
3. `SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>`

Notes:

- Registration email verification and password reset emails are sent by Supabase Auth.
- In Supabase Dashboard, configure `Auth -> URL Configuration` with your app URL and redirect URLs (`/verify-email`, `/reset-password`).
- Legacy Resend fallback is still supported only if Supabase auth env vars are missing.

### Main Domain Setup (Vercel)

Use your primary platform domain (example: `securepdf.vikasbendha.com`) as the app origin.

1. Add the domain in Vercel Project -> `Settings` -> `Domains`.
2. Set Vercel env vars:
   - `APP_BASE_URL=https://securepdf.vikasbendha.com`
   - `NEXT_PUBLIC_BACKEND_URL=` (empty, so frontend uses same-origin `/api`)
   - `CORS_ORIGINS=https://securepdf.vikasbendha.com,https://disposable-pdf-project.vercel.app,http://localhost:3000`
3. Redeploy.

If `NEXT_PUBLIC_BACKEND_URL` is set to another host, custom-domain pages may fail due cross-origin/CORS mismatch.

### User Custom Domain Flow (DNS + SSL)

After users add a domain in **Settings -> Custom Domains**, they will see exact DNS records to add:

1. TXT ownership record:
   - host: `_autodestroy.<their-domain>`
   - value: generated token shown in UI
2. Routing record:
   - CNAME: `<their-subdomain> -> cname.vercel-dns.com`
   - or apex/root domain A record: `76.76.21.21`
3. Add that same domain to the Vercel project domains.
4. Click **Verify DNS & SSL** in the app.

The domain is only usable for secure/direct links after:
- DNS ownership + routing verify, and
- SSL certificate is active (issued automatically by Vercel/Let's Encrypt).

### Super Admin: Automatic Vercel Domain Attach/Verify

To make the user flow mostly automatic, configure Vercel API access in:

- **Admin Settings -> Vercel Domain Automation**

Set:

1. `Project ID` (your Vercel project id)
2. `Team ID` (optional, only if project is under a team)
3. `API Token` (Vercel token with project/domain permissions)
4. Keep **Auto-attach domains** enabled

What this does:

- When a user adds a domain, backend tries to attach it to your Vercel project automatically.
- When user clicks **Verify DNS & SSL**, backend also calls Vercel verify API and stores status (`pending/verified/error`) visible in Settings UI.
- Domain is still blocked for link usage until DNS ownership + routing + active SSL checks pass.

### What End Users See

Normal users do not need access to Vercel. They only need:

1. **Settings -> Custom Domains**
2. Copy DNS values shown per domain:
   - TXT host/value
   - CNAME target (or A record for apex)
3. Click **Verify DNS & SSL**

The UI already shows:

- DNS status
- SSL status
- Vercel status
- precise DNS records required for their domain

### Automatic DB Migration on Vercel

This project now uses a Vercel build wrapper (`scripts/vercel/build.cjs`):

- On **Vercel production** deployments, DB migration runs automatically before `next build`.
- On local builds and preview builds, migration is skipped by default.

Control flags:

- `RUN_DB_MIGRATIONS_ON_BUILD=true|false` (default: auto true only on Vercel production)
- `SKIP_DB_MIGRATE=true|false` (emergency override to skip migration)

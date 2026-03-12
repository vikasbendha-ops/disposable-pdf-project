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

### Automatic DB Migration on Vercel

This project now uses a Vercel build wrapper (`scripts/vercel/build.cjs`):

- On **Vercel production** deployments, DB migration runs automatically before `next build`.
- On local builds and preview builds, migration is skipped by default.

Control flags:

- `RUN_DB_MIGRATIONS_ON_BUILD=true|false` (default: auto true only on Vercel production)
- `SKIP_DB_MIGRATE=true|false` (emergency override to skip migration)

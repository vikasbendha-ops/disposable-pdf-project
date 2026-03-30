# Autodestroy PDF Platform

Autodestroy is a multi-tenant SaaS platform for secure PDF delivery. It lets customers upload PDFs, generate controlled-access links, apply strong viewer restrictions, track access, manage custom domains, run subscriptions, and operate the platform from a single admin surface.

This repository is the active production codebase. It is designed to run as a **single Next.js deployment on Vercel** with:

- a Next.js API backend
- a client-side React application mounted through the Next.js catch-all route
- Supabase Postgres as the main application database
- Supabase DB storage and Wasabi S3-compatible storage as supported file backends

## Overview

The product is built around a secure document-sharing workflow:

1. A user uploads a PDF
2. The user generates one or more secure links
3. Each link can enforce access rules such as expiry, NDA acceptance, IP controls, geo rules, watermarking, fullscreen lock, and single-viewer restrictions
4. Recipients view the PDF inside a hardened web viewer
5. The owner and platform admins can manage analytics, billing, domains, storage, translations, and security settings

The system also supports:

- direct PDF links when enabled
- account teams and workspace sharing
- admin reporting for subscriptions, revenue, refunds, and operations
- white-label custom domains for customer-facing links

## Main Capabilities

### Secure PDF Delivery

- PDF upload and storage
- secure PDF viewer with anti-copy deterrence
- direct PDF links for unrestricted viewing when allowed
- per-link security settings
- per-account secure-link defaults

### Link Expiry Modes

- `Countdown`: starts after first approved open and is tracked per public IP
- `Fixed Date`: expires globally at a specific UTC datetime
- `Manual`: stays active until revoked by the owner or admin

### Advanced Link Security

- focus lock
- idle timeout
- NDA gate
- lock to first IP
- explicit IP allowlist
- country allow / block rules
- single active viewer session
- fullscreen requirement
- strict security mode
- enhanced watermarking

### Watermark Modes

- basic viewer metadata watermark
- custom text watermark
- uploaded logo watermark

### Account and Team Features

- normal users
- admins
- super admins
- customer workspaces with:
  - owner
  - admin
  - member
- invitation and workspace switching flows

### Platform Operations

- Stripe subscriptions and checkout
- admin refunds
- invoice PDF generation
- plan management and pricing-page visibility controls
- storage provider switching and storage migration jobs
- domain verification and SSL tracking
- email delivery provider configuration
- manual translation management
- settings permissions and settings history
- operations health and background jobs

## Active Tech Stack

### Runtime

- Next.js 15
- React 19
- React Router inside the mounted client app
- Node.js runtime on Vercel

### Data and Storage

- Supabase Postgres
- JSON document model stored in `public.app_documents`
- binary file storage in `public.app_files`
- optional Wasabi S3-compatible object storage

### UI

- Tailwind CSS
- Radix UI primitives
- custom app components under `frontend/src/components`

### Payments and External Integrations

- Stripe
- Supabase Auth
- Google OAuth via Supabase
- Resend / Gmail / Mailgun / Outlook / SMTP delivery options
- Vercel domains API

## Repository Structure

```text
.
├── db/                         # SQL schema and index reference
├── docs/                       # Generated context export and supporting docs
├── frontend/                   # React application source used by the Next.js shell
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── i18n/
│       ├── lib/
│       └── pages/
├── lib/                        # Backend business logic, store, SEO helpers, router
│   └── api/
├── memory/                     # Historical product notes / PRD
├── pages/                      # Next.js pages and API entrypoints
│   └── api/
├── public/                     # Static assets
├── scripts/                    # Build, DB, i18n, and context export scripts
└── README.md
```

## Important Files

| File | Purpose |
| --- | --- |
| [pages/[[...slug]].jsx](/Users/apple/Downloads/Disposable-pdf-main/pages/[[...slug]].jsx) | Next.js catch-all page that mounts the React SPA and injects SEO metadata |
| [frontend/src/App.js](/Users/apple/Downloads/Disposable-pdf-main/frontend/src/App.js) | client route map, providers, auth bootstrap, shared config loading |
| [pages/api/[...path].js](/Users/apple/Downloads/Disposable-pdf-main/pages/api/[...path].js) | catch-all API entrypoint |
| [lib/api/router.js](/Users/apple/Downloads/Disposable-pdf-main/lib/api/router.js) | API route dispatcher |
| [lib/api-handler.js](/Users/apple/Downloads/Disposable-pdf-main/lib/api-handler.js) | main backend business logic |
| [lib/store.js](/Users/apple/Downloads/Disposable-pdf-main/lib/store.js) | Supabase/Postgres-backed document store |
| [db/supabase_schema.sql](/Users/apple/Downloads/Disposable-pdf-main/db/supabase_schema.sql) | schema and indexes |
| [frontend/src/pages/SecureViewer.jsx](/Users/apple/Downloads/Disposable-pdf-main/frontend/src/pages/SecureViewer.jsx) | secure PDF viewer |
| [frontend/src/pages/PDFManagement.jsx](/Users/apple/Downloads/Disposable-pdf-main/frontend/src/pages/PDFManagement.jsx) | workspace PDF and folder management |
| [frontend/src/pages/AdminDashboard.jsx](/Users/apple/Downloads/Disposable-pdf-main/frontend/src/pages/AdminDashboard.jsx) | admin metrics and revenue reporting |
| [frontend/src/pages/AdminSettings.jsx](/Users/apple/Downloads/Disposable-pdf-main/frontend/src/pages/AdminSettings.jsx) | grouped admin platform settings |

## Current Runtime Architecture

This is not a separate frontend plus separate Python backend deployment anymore.

The active application model is:

- **frontend shell**: Next.js pages
- **client app**: React SPA in `frontend/src`
- **backend**: Next.js API routes under `pages/api`
- **database**: Supabase Postgres
- **deployment target**: one Vercel project

The historical `backend/` directory may still exist in the repository, but it is not the primary runtime path for the deployed product.

## Roles and Access Model

### Platform Roles

- `user`
- `admin`
- `super_admin`

### Workspace Roles

- `owner`
- `admin`
- `member`

Platform roles control access to platform-level admin surfaces.
Workspace roles control what a customer team member can do inside a shared account workspace.

## Secure Link Behavior

### Countdown Links

- countdown begins after first approved open
- countdown is tracked per public IP
- different browsers or devices on the same public IP share the same countdown state

### Fixed-Date Links

- expire globally at the configured datetime
- all devices and IPs see the same expiry state

### Manual Links

- remain active until revoked

### Security Notes

This platform can **increase friction and deterrence** around copying, screenshots, and redistribution, but no browser application can guarantee full screenshot prevention at the operating-system level.

## Billing and Revenue Features

- plan management from admin settings
- public / hidden plans for pricing page display
- direct plan links for sharing
- Stripe subscription checkout
- billing portal access
- invoice generation
- refund workflow
- admin revenue and refund reporting
- reporting tabs and date filters on admin dashboard

## Localization

Supported languages:

- English
- Spanish
- French
- German
- Italian
- Hindi
- Slovenian

The platform supports:

- admin-set primary platform language
- user language override
- manual translation overrides
- advanced translation editing

## Custom Domains

Customers can connect custom domains for secure and direct PDF links.

Supported verification/routing model:

- TXT ownership record
- CNAME routing for subdomains
- A record support for apex/root domains
- SSL verification and readiness tracking
- optional Vercel API automation for domain attachment and verification

## Storage Model

Supported storage providers:

- `supabase_db`
- `wasabi_s3`

The application includes:

- storage provider settings
- migration job creation
- operations health visibility
- file serving through the platform’s secure access logic

## Email Delivery

Supported delivery providers:

- `supabase`
- `gmail`
- `mailgun`
- `outlook`
- `smtp`
- `resend`

Admin can manage provider-specific delivery settings from the platform settings area.

## Environment Variables

Use [`.env.example`](/Users/apple/Downloads/Disposable-pdf-main/.env.example) as the source of truth for environment setup.

Main categories:

- Supabase DB and auth
- app security
- email delivery
- storage provider
- Stripe
- CORS
- custom domain verification
- seed settings

Do not commit real credentials into this repository.

## Local Development

Install dependencies:

```bash
npm install
```

Run the app locally:

```bash
npm run dev
```

The app runs as a Next.js project from the repository root.

## Build and Validation

Main commands:

```bash
npm run build
npm run db:migrate
npm run db:seed
npm run i18n:validate
```

Notes:

- production builds on Vercel use [scripts/vercel/build.cjs](/Users/apple/Downloads/Disposable-pdf-main/scripts/vercel/build.cjs)
- DB migration is enabled by default for Vercel production deploys
- local builds do not automatically migrate unless explicitly requested

## Vercel Deployment

### Project Setup

1. Import this repository into Vercel
2. Keep the **Root Directory** as the repository root
3. Use:
   - build command: `npm run build`
   - output directory: Next.js default
4. Add env vars from `.env.example`

### Recommended Vercel Environment

- `APP_BASE_URL=https://your-live-domain`
- `NEXT_PUBLIC_BACKEND_URL=`
  Keep this empty when using same-origin `/api`

### CORS

Set `CORS_ORIGINS` to include:

- the main live domain
- the Vercel deployment domain if needed
- localhost for development

## Supabase Setup

Required env vars:

- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Apply schema:

```bash
npm run db:migrate
```

Optional seed:

```bash
npm run db:seed
```

## Google Login Setup

Google login/signup is handled through Supabase Auth.

Typical requirements:

1. enable Google provider in Supabase Auth
2. use the Google OAuth client ID and secret there
3. configure the Supabase callback URL in Google Cloud
4. configure Supabase site URL and redirect URLs for the live domain and localhost

## Main Domain Setup

Use your main platform domain, for example:

- `https://securepdf.yourdomain.com`

Set:

- `APP_BASE_URL=https://securepdf.yourdomain.com`
- `NEXT_PUBLIC_BACKEND_URL=` (empty)
- appropriate `CORS_ORIGINS`

## Customer Custom Domain Flow

End users add domains from:

- `Settings -> Custom Domains`

They are shown the exact DNS records needed:

1. TXT ownership record
2. routing record:
   - CNAME for subdomains
   - or A record for apex domains
3. verify DNS and SSL in the app

The domain becomes usable only after ownership, routing, and SSL checks pass.

## Admin Areas

### Admin Dashboard

Includes:

- user and subscription totals
- revenue metrics
- refund metrics
- plan performance
- recent refund visibility
- reporting tabs and date filters

### Admin Settings

Grouped areas include:

- operations
- commerce
- platform
- infrastructure
- access

These areas cover payments, plans, email, localization, branding, SEO, storage, domains, permissions, jobs, and history.

## Reporting and Refunds

The admin dashboard supports:

- overview metrics
- revenue reporting
- subscription reporting
- refund reporting
- date filters:
  - 7 days
  - 30 days
  - 90 days
  - 365 days
  - all time
  - custom date range

Admin refund tools support:

- full refunds
- partial refunds
- refund reasons
- internal refund notes

## Team Workspaces

Customer accounts support team collaboration:

- invite team members
- accept or decline invitations
- switch workspaces
- operate inside the owner account’s workspace

This affects PDFs, folders, links, domains, and dashboard data.

## Audit and Operational Visibility

The system includes:

- audit events
- settings change history
- background jobs
- operations health
- platform-level admin logs

## Offline Codex Handoff

This repository includes a generated handoff pack for another Codex instance or offline machine.

Run:

```bash
npm run context:export
```

Generated files:

- [docs/PROJECT_CONTEXT_EXPORT.md](/Users/apple/Downloads/Disposable-pdf-main/docs/PROJECT_CONTEXT_EXPORT.md)
- [docs/PROJECT_CONTEXT_EXPORT.json](/Users/apple/Downloads/Disposable-pdf-main/docs/PROJECT_CONTEXT_EXPORT.json)

Regenerate and commit these when any of the following change:

- routes
- env vars
- schema
- auth flows
- billing flows
- secure link logic
- storage providers
- localization model
- team/workspace behavior
- admin settings structure

## Documentation Set

Additional focused docs now live under [docs/README.md](/Users/apple/Downloads/Disposable-pdf-main/docs/README.md):

1. [docs/OPERATIONS_RUNBOOK.md](/Users/apple/Downloads/Disposable-pdf-main/docs/OPERATIONS_RUNBOOK.md)
2. [docs/SECURITY_MODEL.md](/Users/apple/Downloads/Disposable-pdf-main/docs/SECURITY_MODEL.md)
3. [docs/BILLING_AND_REFUNDS.md](/Users/apple/Downloads/Disposable-pdf-main/docs/BILLING_AND_REFUNDS.md)
4. [docs/CUSTOM_DOMAINS.md](/Users/apple/Downloads/Disposable-pdf-main/docs/CUSTOM_DOMAINS.md)
5. [docs/STORAGE_MIGRATION.md](/Users/apple/Downloads/Disposable-pdf-main/docs/STORAGE_MIGRATION.md)
6. [docs/TEAM_WORKSPACES.md](/Users/apple/Downloads/Disposable-pdf-main/docs/TEAM_WORKSPACES.md)

## Notes for Future Maintainers

- start with [README.md](/Users/apple/Downloads/Disposable-pdf-main/README.md) for the operator and project overview
- use [docs/PROJECT_CONTEXT_EXPORT.md](/Users/apple/Downloads/Disposable-pdf-main/docs/PROJECT_CONTEXT_EXPORT.md) for the detailed machine handoff
- treat [memory/PRD.md](/Users/apple/Downloads/Disposable-pdf-main/memory/PRD.md) as historical product context, not the current runtime source of truth

## License / Internal Use

Add your final license statement or internal usage policy here if you want this repository to be shared beyond the current team.

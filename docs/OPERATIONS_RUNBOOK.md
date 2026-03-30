# Operations Runbook

This document is the practical operator guide for running and supporting the Autodestroy PDF Platform.

## 1. Current Deployment Model

The active production model is:

- one Vercel project
- one Next.js application at repository root
- same-origin frontend and backend under the same deployment
- Supabase Postgres for application data
- Supabase DB storage and/or Wasabi for PDF storage

Important:

- the active runtime is the root Next.js app
- the historical `backend/` folder is not the primary production runtime

## 2. Core Dependencies

### Required Platform Dependencies

- Vercel
- Supabase project
- environment variables from `.env.example`

### Optional but Common Dependencies

- Stripe
- Wasabi
- Gmail / Mailgun / Outlook / SMTP / Resend
- Vercel API token for domain attach automation

## 3. Standard Operational Commands

Install:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Production build validation:

```bash
npm run build
```

DB migration:

```bash
npm run db:migrate
```

Optional seed:

```bash
npm run db:seed
```

Translation validation:

```bash
npm run i18n:validate
```

Context export refresh:

```bash
npm run context:export
```

## 4. Environment Setup

Use `.env.example` as the source of truth.

Most important variables:

- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `JWT_SECRET_KEY`
- `APP_BASE_URL`
- `CORS_ORIGINS`
- `DEFAULT_STORAGE_PROVIDER`
- `EMAIL_DELIVERY_PROVIDER`
- `STRIPE_API_KEY`
- `STRIPE_WEBHOOK_SECRET`

## 5. Deployment Procedure

### Vercel

1. Push to GitHub
2. Let Vercel deploy from repository root
3. Build command:
   - `npm run build`
4. Keep `NEXT_PUBLIC_BACKEND_URL` empty for same-origin `/api`
5. Ensure all live env vars are configured in Vercel

### Build-Time Migration Behavior

Production builds on Vercel run through `scripts/vercel/build.cjs`.

Important flags:

- `RUN_DB_MIGRATIONS_ON_BUILD`
- `SKIP_DB_MIGRATE`

Recommended default:

- production builds may run migrations automatically
- local development should migrate intentionally, not implicitly

## 6. Operational Health Areas

The platform exposes operational control surfaces through admin settings and admin reporting.

Monitor these areas regularly:

- application availability
- Supabase DB connectivity
- storage provider state
- Stripe billing and webhook health
- email delivery state
- Vercel domain verification state
- background jobs and queue state
- settings history and audit events

## 7. Daily / Routine Operator Checklist

Recommended routine checks:

1. Open admin dashboard and verify:
   - revenue panels load
   - subscription status boxes look reasonable
   - refunds list is current
2. Open admin settings and verify:
   - operations health does not show obvious failures
   - queued and failed jobs are reasonable
   - storage provider settings are expected
   - email delivery provider is correct
3. Review audit activity for:
   - suspicious admin changes
   - repeated failed actions
   - unexpected refund activity
4. Review custom domain verification issues
5. Review team invitation or workspace-related support issues

## 8. Incident Response

### A. Login / Auth Issues

Check:

- Supabase Auth configuration
- `APP_BASE_URL`
- Supabase URL configuration and redirect URLs
- Google provider setup if social login is involved
- password reset / verification email provider status

### B. PDF Access Issues

Check:

- link status
- expiry mode
- viewer token route
- direct access settings
- security rules:
  - NDA required
  - IP restriction
  - geo restriction
  - single viewer session
  - fullscreen lock

### C. Domain Issues

Check:

- TXT verification record
- CNAME or apex A record
- Vercel attach status
- SSL status
- `APP_BASE_URL`
- domain-specific verification error messages

### D. Email Delivery Issues

Check:

- active email delivery provider
- provider-specific credentials
- sender identity
- SMTP or provider auth status
- whether the problem affects:
  - password reset
  - verification email
  - team invitations
  - test emails

### E. Billing Issues

Check:

- Stripe API key mode
- webhook secret
- transaction status
- user subscription status
- invoice generation status
- refund records

## 9. Background Jobs

The platform includes a job/queue model for operational tasks such as storage migration and related admin-side workflows.

Operator responsibilities:

- review queued/running/failed jobs
- retry or rerun where appropriate
- confirm job side effects actually completed
- check follow-up state in storage or settings, not only job status

## 10. Settings Change Control

Platform setting changes are sensitive because they can affect:

- billing
- domains
- storage
- security
- translation behavior
- branding and email content

Use these controls:

- settings permissions
- settings history
- audit event review

Recommended practice:

- major platform changes should be performed by super admin only
- changes to domains, payments, and email should be reviewed after save

## 11. Logging and Audit Expectations

The platform records audit events for major actions across:

- auth
- user management
- PDF actions
- link actions
- folder actions
- billing and refunds
- team invitations and memberships
- platform settings

When investigating a support issue, check both:

- user-facing state
- audit trail

## 12. Change Management

Before shipping major platform changes:

1. run build locally
2. run migration if schema changed
3. refresh context export if architecture/config changed
4. deploy to Vercel
5. smoke-test:
   - login
   - PDF upload
   - secure viewer
   - admin dashboard
   - admin settings

## 13. Known Limitations

- screenshot blocking is deterrence-only, not guaranteed
- countdown links are per public IP
- team billing is still owner-account based
- JSONB document modeling means entity behavior is enforced primarily in application code

## 14. Recommended Future Operations Docs

If operations become larger, add:

- incident playbooks by severity
- service dependency map
- webhook troubleshooting matrix
- environment promotion checklist
- backup / restore policy


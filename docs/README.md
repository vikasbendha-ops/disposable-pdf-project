# Documentation Index

This folder contains the operational and architectural documentation for the Autodestroy PDF Platform.

## Core Docs

- [PROJECT_CONTEXT_EXPORT.md](./PROJECT_CONTEXT_EXPORT.md)
  - Generated full-project context pack for offline Codex handoff and emergency workstation onboarding.
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
  - Deployment, health checks, incident response, operational routines, and admin workflows.
- [SECURITY_MODEL.md](./SECURITY_MODEL.md)
  - Roles, workspace permissions, secure link controls, viewer hardening, and security limits.
- [BILLING_AND_REFUNDS.md](./BILLING_AND_REFUNDS.md)
  - Stripe billing model, plans, invoices, reporting, and refund procedures.
- [CUSTOM_DOMAINS.md](./CUSTOM_DOMAINS.md)
  - Customer domain onboarding, DNS, verification, SSL, and troubleshooting.
- [STORAGE_MIGRATION.md](./STORAGE_MIGRATION.md)
  - Supabase/Wasabi storage model, migration jobs, validation, and rollback guidance.
- [TEAM_WORKSPACES.md](./TEAM_WORKSPACES.md)
  - Customer team accounts, workspace roles, invitation lifecycle, and audit expectations.

## Recommended Reading Order

For a new developer or operator:

1. [../README.md](../README.md)
2. [PROJECT_CONTEXT_EXPORT.md](./PROJECT_CONTEXT_EXPORT.md)
3. [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
4. [SECURITY_MODEL.md](./SECURITY_MODEL.md)
5. [BILLING_AND_REFUNDS.md](./BILLING_AND_REFUNDS.md)
6. The domain, storage, or team docs based on the task at hand

## Update Rule

Update these docs when behavior changes in any of the following areas:

- auth or security controls
- secure link rules
- billing and refunds
- plans or invoices
- domains and SSL
- storage providers or migration jobs
- team/workspace permissions
- admin settings or operational workflows

When routes, env vars, schema, or platform capabilities change, also regenerate:

```bash
npm run context:export
```


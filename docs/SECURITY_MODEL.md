# Security Model

This document describes the current security model for the Autodestroy PDF Platform.

## 1. Security Goals

The product is designed to:

- restrict access to sensitive PDFs
- make unauthorized redistribution harder
- provide operator visibility into access and change activity
- support role-based administration and workspace collaboration

The platform is designed for strong deterrence and controlled access, not perfect operating-system-level capture prevention.

## 2. Identity and Authentication

Supported auth flows:

- email/password
- Google login and signup through Supabase Auth
- password reset
- email verification
- verified email change flow

Admin/super admin hardening:

- TOTP-based two-factor authentication
- QR onboarding for authenticator apps

## 3. Platform Roles

Platform roles:

- `user`
- `admin`
- `super_admin`

### Expected Scope

- `user`
  - customer-facing account access
  - PDFs, links, settings, domains, billing visibility, workspace operations
- `admin`
  - platform admin areas allowed by settings permissions
- `super_admin`
  - full platform control including highly sensitive settings

## 4. Workspace Roles

Workspace roles:

- `owner`
- `admin`
- `member`

These roles govern collaboration inside a customer workspace.

### Expected Behavior

- `owner`
  - full control over the workspace
  - can invite/remove members
  - retains account-level ownership
- `admin`
  - can manage workspace operations where permitted
- `member`
  - lower-privilege collaborator

## 5. Secure Link Controls

Each secure link can include combinations of:

- countdown expiry
- fixed-date expiry
- manual revoke only
- focus lock
- idle timeout
- NDA acceptance
- fullscreen requirement
- strict security mode
- enhanced watermark
- single active viewer session
- first-IP lock
- explicit IP allowlist
- geo restriction

## 6. Secure Viewer Protections

The secure viewer includes deterrence-focused controls such as:

- blocked or reduced copy/select behavior
- print blocking
- focus-based blackout
- inactivity blackout
- per-page watermark overlays
- repeated watermark text/logo/details
- session heartbeats for single-viewer enforcement

### Important Limitation

The browser cannot fully prevent:

- OS screenshots
- phone camera capture
- external recording devices

The correct framing is:

- increased friction
- visible attribution
- easier investigation

not perfect exfiltration prevention.

## 7. Watermark Modes

Supported modes:

- `basic`
  - viewer/session/access metadata
- `text`
  - repeated custom text
- `logo`
  - repeated uploaded or configured image

Watermark purpose:

- attribution
- deterrence
- leakage traceability

## 8. Network and Location Controls

The platform supports:

- IP allowlist
- first-IP lock
- country allow / block rules

Geo enforcement is dependent on deployment environment headers. On Vercel, country-level geolocation is based on Vercel request metadata.

## 9. Expiry Model Details

### Countdown

- tracked per public IP
- same public IP across browsers/devices shares the same timer state
- different IPs can begin separate countdowns unless other restrictions block them

### Fixed Date

- one global expiry datetime for all viewers

### Manual

- revoked explicitly by owner/admin action

## 10. Domain Security

Customer domains are gated by:

- TXT ownership verification
- routing verification
- SSL readiness

The platform should not use a customer domain for secure or direct links until the domain is verified and SSL is active.

## 11. Secrets and Sensitive Configuration

These must stay in env or secure admin storage, not in source control:

- JWT secret
- Supabase service key
- Stripe secret key
- Stripe webhook secret
- Wasabi keys
- SMTP credentials
- Gmail / Mailgun / Outlook credentials
- Vercel API token

## 12. Audit and Accountability

The platform records audit events for major actions across:

- authentication
- user management
- PDFs
- links
- folders
- billing
- refunds
- settings
- team invitations and team membership changes

Settings-specific change history also exists to track admin-level configuration changes.

## 13. Security Assumptions

This system assumes:

- the deployment origin and app base URL are configured correctly
- customers understand custom-domain DNS ownership requirements
- admins restrict powerful settings to trusted personnel
- secrets are stored in Vercel / Supabase or equivalent secure config stores

## 14. Known Security Limits

- no browser-based app can guarantee screenshot prevention
- direct PDF links are intentionally less restricted than secure links
- team members operate inside owner-account billing context
- security enforcement depends on correct environment and proxy headers in production

## 15. Recommended Next Security Improvements

Natural future upgrades:

1. admin session management
2. recovery codes for 2FA
3. CIDR-based rules if not already extended further
4. exportable audit reports
5. automated alerting on suspicious access patterns


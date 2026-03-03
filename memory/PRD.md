# Autodestroy PDF Platform - Product Requirements Document

## Original Problem Statement
Multi-tenant SaaS web application for self-destructing PDF links.

## Core Requirements
- **PDF Upload**: Authenticated users can upload PDFs to secure storage
- **Self-Destructing Links**: 3 expiry modes:
  - Mode A (Countdown): Per-IP countdown — each viewer gets own timer after first open  
  - Mode B (Fixed Date): Fixed UTC date, shown in viewer's local timezone
  - Mode C (Manual): Only revoked when owner manually revokes
- **Secure Viewer**: Disable downloads, right-click, print, text selection. Dynamic watermark with IP/timestamp
- **User Dashboard**: PDF management, link management, analytics
- **Admin Dashboard**: User management, link management, Stripe configuration
- **Subscription System**: Stripe integration (sandbox/live modes)
- **Multi-language**: 7 languages (EN, IT, SL, FR, ES, DE, HI)

## Tech Stack
- **Backend**: FastAPI, MongoDB (pymongo), JWT auth, Pydantic
- **Frontend**: React, React Router, Tailwind CSS, Shadcn/UI, Axios
- **Storage**: Local file storage (S3 migration planned)

## What's Been Implemented

### Session 1 (Initial Build)
- User authentication (register/login/JWT)
- Admin user with enterprise plan
- PDF upload to local storage
- Link generation (3 expiry modes)
- Secure PDF viewer (iframe-based)
- Landing page, Pricing page
- Dashboard overview
- Admin dashboard with user/link management

### Session 2 (Feb 26, 2026)
- ✅ **PDF Viewer Fixed**: Removed `sandbox` attribute from iframe - was blocking Chrome's PDF.js viewer
- ✅ **i18n Complete**: 7 languages fully translated (EN, IT, SL, FR, ES, DE, HI)
  - Slovenian (sl) added to translations + backend valid_languages
  - Italian and Hindi completed (minimal → full translations)
  - All nav labels, dashboard, settings, admin pages translated
  - Language context updated to use `getPrimaryLanguages()` (7 languages only)
- ✅ **Stripe Admin Settings**: New `/admin/settings` page for super admin
  - Shows Sandbox/Live mode badge
  - Form to enter live Stripe key (`sk_live_...`)
  - Toggle between sandbox/live modes
  - Backend: `GET/PUT /api/admin/settings/stripe`
  - Settings stored in `platform_settings` MongoDB collection
- ✅ **Expiry Logic Clarified**: 
  - Countdown = per-IP (already implemented in backend)
  - Fixed = universal UTC time displayed in viewer's local timezone
- ✅ **Backend Stripe**: Settings stored in MongoDB `platform_settings` collection

## Architecture

```
/app/
├── backend/
│   ├── uploads/          # PDF file storage
│   ├── server.py         # All endpoints, models, business logic
│   └── .env              # MONGO_URL, DB_NAME, STRIPE_API_KEY, SECRET_KEY
└── frontend/
    ├── src/
    │   ├── i18n/
    │   │   └── translations.js     # All 7 languages + getPrimaryLanguages()
    │   ├── contexts/
    │   │   └── LanguageContext.jsx # Language state management
    │   ├── pages/
    │   │   ├── Dashboard.jsx        # i18n ✅
    │   │   ├── PDFManagement.jsx    # i18n ✅
    │   │   ├── MyLinks.jsx          # i18n ✅ (title)
    │   │   ├── LinkGenerator.jsx    # i18n ✅ (title)
    │   │   ├── Settings.jsx         # i18n ✅
    │   │   ├── SecureViewer.jsx     # PDF iframe (no sandbox) ✅
    │   │   ├── AdminSettings.jsx    # NEW: Stripe config page ✅
    │   │   ├── AdminDashboard.jsx   # Admin overview
    │   │   ├── ManageUsers.jsx
    │   │   └── AllLinks.jsx
    │   └── components/
    │       └── DashboardLayout.jsx  # i18n nav labels ✅
    └── .env
```

## Key API Endpoints
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login  
- `PUT /api/auth/language` - Update language (supports: en,it,sl,fr,es,de,hi + others)
- `POST /api/pdfs/upload` - Upload PDF
- `POST /api/links` - Create link
- `GET /api/view/{token}` - Access link (registers IP session for countdown)
- `GET /api/view/{token}/pdf` - Serve PDF file
- `GET /api/admin/settings/stripe` - Get Stripe config (admin only)
- `PUT /api/admin/settings/stripe` - Update Stripe config (admin only)

## DB Collections
- `users`: user_id, email, hashed_password, role, subscription_status, plan, language
- `pdfs`: pdf_id, user_id, filename, file_path, file_size, created_at
- `links`: link_id, user_id, pdf_id, token, expiry_mode, expires_at, ip_sessions, status
- `platform_settings`: key ("stripe"), mode, stripe_key, updated_at
- `folders`: folder_id, user_id, name, parent_id, created_at
- `domains`: domain_id, user_id, domain, verification_status

## P0/P1/P2 Backlog

### P0 - Critical
- [ ] Stripe webhooks for subscription lifecycle (payment.succeeded, payment.failed, subscription.cancelled)

### P1 - High Priority  
- [ ] Enhanced Secure PDF Viewer: stronger watermarking (CSS overlay, not just text)
- [ ] Admin dashboard: link analytics, storage metrics per user
- [ ] Dashboard tracking reimagined: open counts by time, IP logs visualization

### P2 - Medium Priority
- [ ] Custom domain support (multi-tenant)
- [ ] Cloud storage migration (S3/R2)
- [ ] Background cleanup jobs for expired files
- [ ] Google OAuth integration
- [ ] Email notifications (link expiry, access alerts)

## Credentials (Test)
- Super Admin: admin@autodestroy.com / admin123
- Preview URL: https://secure-expire-pdf.preview.emergentagent.com

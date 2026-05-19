# FOODPRO POS — PRD & Implementation Status

## Original Problem Statement
نظام إدارة مطاعم متكامل **FOODPRO POS** متعدد المستأجرين مع POS, KDS, Inventory, Customers, QR Menus, Google Auth, AI Chatbot، ونظام اشتراكات Paddle SaaS كامل.

## Tech Stack
- **Node.js** v20 + **pnpm** 9.15.5 (monorepo)
- **PostgreSQL** 15 (foodoro_db) + Drizzle ORM + RLS
- **Backend**: Express 5 TypeScript ESM (port 8001)
- **Frontend**: React 19 + Vite 7 (production build)
- **AI Sidecar**: Python FastAPI + emergentintegrations (Claude Haiku 4.5)
- **Auth**: Custom JWT + Emergent Google OAuth
- **Payments**: Paddle Billing v2 (HMAC-verified webhooks, mock fallback when keys missing)

## What's been implemented

### 2026-02-20 — Paddle SaaS Subscriptions + Product Images + QR Timeout
- ✅ **PLANS** finalized to match spec exactly:
  - Starter: $149 / 1 branch / 2 users / 6 features
  - Growth: $349 / 3 branches / 10 users / 17 features (highlighted)
  - Enterprise: $999 / unlimited / 22 features
- ✅ Trial = 14 days, auto-created at signup with 1 branch + 3 users + no api/webhooks
- ✅ New tables: `subscriptions`, `billing_events`, `invoices`, `app_notifications`, `leads`
- ✅ `checkFeature(feature)` middleware enforces plan features per API call
- ✅ `readOnlyGuard` blocks ALL writes from expired/canceled tenants (GETs always pass)
- ✅ `inventory` route → Growth+ only
- ✅ Per-plan branch & user limit enforcement
- ✅ POST `/api/subscription/checkout` — creates Paddle transaction (or mock-activates when keys absent)
- ✅ POST `/api/subscription/upgrade` — immediate plan change (active subs only)
- ✅ POST `/api/subscription/downgrade` — scheduled for period end
- ✅ POST `/api/subscription/cancel` + `/resume` — cancel at period end
- ✅ POST `/api/paddle/webhook` — RAW body, HMAC-SHA256 signature verification, idempotent via `paddle_event_id` UNIQUE
- ✅ Handled events: subscription.created/updated/canceled, transaction.completed/paid, payment_failed
- ✅ GET `/api/subscription/invoices` — full invoice history
- ✅ GET `/api/subscription/notifications` — in-app trial-warning + expiry banners
- ✅ Frontend `/billing` page completely rewritten — current plan card, usage bars, 3 plan grid, invoices table, cancel/resume buttons
- ✅ Sticky `<SubscriptionBanner />` in layout — auto-shows trial countdown (≤ 7 days) + expired warning + cancellation reminder

### Product images
- ✅ `image_url` column already on products table
- ✅ POST `/api/uploads/image` (multipart) + `/api/uploads/image-base64` — 4 MB cap, jpeg/png/webp/gif only
- ✅ Static serving at `/uploads/products/*`
- ✅ Product form has file picker (phone upload) + URL paste input
- ✅ Product cards + POS tiles render `imageUrl` when present

### QR Customer ordering session
- ✅ New columns `qr_tokens.session_started_at` + `session_expires_at`
- ✅ First scan opens a 5-minute window
- ✅ After 5 minutes → 410 Gone + token deactivated; customer must re-scan
- ✅ Order POST also validates session window

### Earlier sessions (kept)
- ✅ Restaurant-only signup with 25 business types + custom-text validator
- ✅ AI Chat with Claude Haiku 4.5 via Emergent Universal Key
- ✅ Custom JWT + Emergent Google Auth (Clerk removed)
- ✅ 3D orange-cloud "Foodie" AI avatar

## Architecture
```
Browser → Vite preview (3000)
        → k8s ingress
        → Express (8001) ──▶ PostgreSQL 15
        │   ├─ /api/subscription/* (auth)
        │   ├─ /api/paddle/webhook (HMAC verified)
        │   ├─ /api/uploads/* (auth)
        │   └─ /uploads/products/* (static)
        └─ Python AI Sidecar (9000) → Claude Haiku 4.5
```

## Plan Feature Gating Map
| Feature           | Starter | Growth | Enterprise | Trial |
|-------------------|:-:|:-:|:-:|:-:|
| POS / Orders      | ✅ | ✅ | ✅ | ✅ |
| Products / Cats   | ✅ | ✅ | ✅ | ✅ |
| QR Menu           | ✅ | ✅ | ✅ | ✅ |
| Basic Reports     | ✅ | ✅ | ✅ | ✅ |
| KDS / Inventory   | ❌ | ✅ | ✅ | ✅ |
| Loyalty / Coupons | ❌ | ✅ | ✅ | ✅ |
| AI Chat / Insights| ❌ | ✅ | ✅ | ✅ |
| RBAC              | ❌ | ✅ | ✅ | ✅ |
| API Access        | ❌ | ❌ | ✅ | ❌ |
| Webhooks          | ❌ | ❌ | ✅ | ❌ |
| Audit Logs        | ❌ | ❌ | ✅ | ❌ |

## Demo Credentials
- URL: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- Email: `demo@foodpro.com`
- Password: `Demo2026!`
- Plan: Enterprise / Active (1-year period)

## Required ENV (for production Paddle)
```
PADDLE_API_KEY=pdl_xxx               # Paddle Billing API key
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx # Webhook secret for HMAC verification
PADDLE_ENV=production                # or sandbox (default)
PADDLE_PRICE_STARTER=pri_xxx         # 149 USD/yr
PADDLE_PRICE_GROWTH=pri_xxx          # 349 USD/yr
PADDLE_PRICE_ENTERPRISE=pri_xxx      # 999 USD/yr
```
Until set, system runs in **mock-checkout mode** — clicking Upgrade instantly
activates the plan + writes a DEMO invoice. Real Paddle integration only
requires populating those vars.

## Next Action Items
- **P0**: Owner provides real Paddle production keys to flip from mock → live billing
- **P1**: Apply `checkFeature("kds")` middleware on KDS routes
- **P1**: Apply `checkFeature("webhooks")` middleware on webhook management routes
- **P2**: Subscription email notifications (Resend or SMTP)
- **P2**: Redis cache for refresh tokens
- **P3**: PWA / Offline Service Worker

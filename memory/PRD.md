# FOODPRO POS — PRD & Implementation Status

## Original Problem Statement
نظام إدارة مطاعم متكامل **FOODPRO POS** متعدد المستأجرين مع POS, KDS, Inventory, Customers, QR Menus, Auth, AI Chatbot، نظام اشتراكات Paddle SaaS، رفع صور المنتجات، QR session timeout، وميزات SaaS متقدمة.

## Tech Stack
- Node 20 + pnpm 9.15.5 monorepo, Express 5 TS ESM (8001), React 19 + Vite 7 (3000), PostgreSQL 15 + Drizzle/RLS
- AI sidecar: Python FastAPI + emergentintegrations (Claude Haiku 4.5)
- Payments: Paddle Billing v2 (HMAC + mock fallback)
- Persistence: `/app/pgdata` (survives container rebuilds) + supervisor bootstrap

## Recent Sessions

### 2026-02-21 — Demo mode + QR orders + Discounts + Invoice settings + Master pwd
- ✅ `tenants.demo_mode` flag → bypasses ALL feature gating + read-only checks (for investor showcase)
- ✅ Order schema: `order_items.item_note`, `orders.general_note`, `orders.customer_name/phone`, `orders.kitchen_ready_at`, `orders.payment_method`, `orders.source` (pos | qr)
- ✅ **QR Orders router** `/api/qr-orders` — list / customer-info / pay / XLSX export (ExcelJS)
- ✅ **Discounts router** `/api/discounts/*` + `/api/orders/:id/discount` — mandatory reason (vip/friend/coupon/occasion/other), role-based caps, full `discount_logs` table
- ✅ **Invoice settings router** `/api/invoice-settings` + `/api/invoice-settings/qr` (QRCode lib) — paper sizes 58/80mm/A5/A4, welcome message, footer, logo
- ✅ Master password router already in place (`/api/security/master-password/*`) — verified existing implementation works
- ✅ Per-item notes on QR menu (`order.tsx`) with explicit input under each cart item
- ✅ Customer name/phone registration step on QR before order submission
- ✅ Item notes flow through `order_items.item_note` and display in KDS card

### 2026-02-20 — Paddle SaaS Subscriptions
- ✅ Three plans (Starter $149 / Growth $349 / Enterprise $999) — exact spec match
- ✅ 14-day trial auto-created on signup (1 branch / 3 users / no API/Webhooks)
- ✅ `checkFeature(feature)` + `readOnlyGuard` middleware
- ✅ Paddle webhook with HMAC-SHA256 + idempotent via `paddle_event_id` UNIQUE
- ✅ Upgrade immediate, Downgrade at period end, Cancel/Resume
- ✅ `/billing` page with current plan, usage bars, plan grid, invoices, cancel/resume
- ✅ `<SubscriptionBanner />` global — trial countdown + expired warning + cancellation reminder
- ✅ Product image upload (multipart 4 MB + base64 + URL paste) — visible in POS + products list
- ✅ QR session 5-minute window — after expiry → 410 + must re-scan

### Earlier sessions
- ✅ Restaurant-only signup (25 business types + validator)
- ✅ AI Chat with Claude Haiku 4.5 via Emergent Universal Key (cute 3D orange-cloud avatar)
- ✅ Custom JWT + Emergent Google Auth
- ✅ FOODORO → FOODPRO rename
- ✅ Tax-inclusive math fix
- ✅ Marketing landing page (Hero + Features + Pricing + Lead form) — no direct contact channels per spec

## Persistence & Auto-recovery
- `/app/scripts/bootstrap.sh` — idempotent boot script (priority=1 supervisor program)
  - Installs PostgreSQL 15 + pnpm if missing
  - Creates DB, RLS roles, demo user (`demo@foodpro.com` / `Demo2026!`)
  - Pushes Drizzle migrations + applies RLS
  - Adds extra raw-SQL tables (subscriptions / billing_events / invoices / app_notifications / leads / discount_settings / discount_logs / invoice_settings)
- `/app/pgdata` stores Postgres data → survives container resets
- backend & frontend wait for `/tmp/foodpro-bootstrap.done` before starting

## Demo Credentials
- URL: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- Email: `demo@foodpro.com`
- Password: `Demo2026!`
- Plan: Enterprise / Active  +  `demo_mode = TRUE` (full reports unlocked for investor demo)

## Status: Currently Implemented vs Pending

### Done (this big spec)
| # | Feature | Status |
|---|---------|--------|
| 1 | QR orders + customer info + pay + XLSX | ✅ backend ready; UI integrates customer step |
| 2 | Per-item notes in POS, KDS, QR | ✅ schema + flow + KDS render |
| 3 | Product images upload + display | ✅ from previous session |
| 4 | Discounts with mandatory reason + caps + logs | ✅ |
| 5 | Invoice customization + QR generation | ✅ backend; UI page deferred |
| 7 | Master password protection | ✅ existing implementation |
| 10 | Reports demo_mode bypass | ✅ |

### Deferred (P1-P2 — too large for one session)
| # | Feature | Why deferred |
|---|---------|--------------|
| 6 | Offline-first PWA (Service Worker + IndexedDB sync) | 2-3 days work; needs Workbox + Dexie + conflict resolution |
| 8 | Full RBAC overhaul (10 roles + per-permission gating) | partial RBAC already in place; expanding to all 10 = 1 day |
| 9 | WebSocket real-time sync (Socket.io) | needs Redis adapter for prod + event wiring on every mutation |
| 11 | 25-language i18n bundles | infrastructure exists (react-i18next); content for 23 new languages requires translation pipeline |
| 12 | Multi-currency with Frankfurter API + cron | 4-5 hours work; needs scheduler + per-tenant base currency |

## Next Action Items (priority order)
1. **P0** — UI pages for `/settings/discounts` + `/settings/invoice` + `/cashier/qr-orders`
2. **P0** — Paddle production keys to flip from mock → live billing
3. **P1** — Socket.io basic events: order:created / order:status_updated (1 day)
4. **P1** — Currency conversion in reports (4 hours)
5. **P2** — Offline-first PWA (Workbox + Dexie)
6. **P2** — Expand to 25 languages

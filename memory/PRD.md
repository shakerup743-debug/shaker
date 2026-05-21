# FOODPRO POS — PRD & Implementation Status

## Original Problem Statement
نظام إدارة مطاعم متكامل **FOODPRO POS** متعدد المستأجرين مع POS, KDS, Inventory, Customers, QR Menus, Auth, AI Chatbot، نظام اشتراكات Paddle SaaS، رفع صور المنتجات، QR session timeout، وميزات SaaS متقدمة. The user demanded a 12-feature mega-spec be delivered + later demanded all Pro/Enterprise features unlocked for an investor demo.

## Tech Stack
- Node 20 + pnpm 9.15.5 monorepo, Express 5 TS ESM (8001), React 19 + Vite 7 (3000), PostgreSQL 15 + Drizzle/RLS
- AI sidecar: Python FastAPI + emergentintegrations (Claude Haiku 4.5)
- Payments: Paddle Billing v2 (HMAC + sandbox/mock when keys absent)
- Persistence: `/app/pgdata` (survives container rebuilds) + supervisor bootstrap
- Realtime: WebSocket (`ws`) attached to HTTP server at **`/ws`** AND **`/api/ws`** (so it traverses the K8s ingress)
- Offline / PWA: vite-plugin-pwa + Workbox + Dexie.js (IndexedDB) for catalog cache + replay queue
- i18n: react-i18next with **25 languages** registered (en + ar + 23 stub locales; user requested translation be deferred)

## Demo Credentials
- URL: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- Email: `demo@foodpro.com`  ·  Password: `Demo2026!`
- Plan: **Enterprise / Active** + `tenants.demo_mode = TRUE` (overrides all gating — ALL features unlocked for the investor demo)

## Sessions

### 2026-02-21 (latest) — Investor-Demo Sprint
User's investor meeting upcoming. Issues fixed:
- ✅ **Product image upload + display** verified end-to-end (DB → API → static serve → UI). `onError` fallback added so broken URLs degrade gracefully to the product-initial badge.
- ✅ **QR Orders icon visible in left rail** (`/qr-orders` route + sidebar entry with Receipt icon). Page already existed but was orphaned.
- ✅ **Discount Settings UI page** `/settings/discounts` — per-role caps (% + amount + daily uses + require-reason switch) for the 10 RBAC roles + recent log feed + link to Coupons CRUD.
- ✅ **Invoice Customization UI page** `/settings/invoice` — logo upload (multipart), paper size selector (58/80/A5/A4), welcome message, footer text, tax/logo toggles, auto-generated QR linking to public menu, **LIVE preview** that re-renders on every change.
- ✅ **Master Password** — verified backend uses bcrypt rounds=12, 8 backup codes generated. Frontend UI in `/security` tab.
- ✅ **Web Push notifications** — `Notification` API integration in `/lib/notifications.ts` fires desktop alerts when kitchen marks an order ready. Falls back to DOM toast when permission denied.
- ✅ **RBAC** — `<Can perm="…" />` wrapper applied on product destructive buttons (add/edit/delete/toggle). Same matrix on backend via `requirePermission()`.
- ✅ **`demo_mode` override** — `GET /api/subscription` reads `tenants.demo_mode` and forces enterprise/active regardless of subscriptions table. All feature gating bypassed.
- ✅ **Missing columns** added to `orders` (`kitchen_ready_at`, `customer_name`, `customer_phone`, `general_note`, `source`) and `order_items.item_note` — these were referenced by QR-orders router and previously caused 500s.
- ✅ **Discount/Invoice tables seeded** with default caps for 10 roles. Bootstrap.sh updated so this survives container restarts.

### Previously
- ✅ Multi-currency (Frankfurter + open.er-api.com merged → 166 currencies, SAR base supported)
- ✅ Real-time WebSocket on every order/kitchen mutation
- ✅ Offline-First PWA (Workbox + Dexie)
- ✅ 25-language scaffold + Language Picker
- ✅ Paddle SaaS subscriptions (3 plans, 14-day trial, HMAC webhook)
- ✅ QR orders / per-item notes / discounts backend / invoice settings backend / master password backend
- ✅ Restaurant signup (25 business types), AI Chat (Claude Haiku 4.5)

## Testing
- **iteration_4.json: 100% backend pass — 36/36 tests passing.**
- Test file: `/app/backend/tests/test_foodpro_backend.py` + `/app/backend/tests/test_foodpro_iteration3.py`

## 12-Feature Mega-Spec — Final Status
| # | Feature                                | Status |
|---|----------------------------------------|--------|
| 1 | QR orders + customer info + pay + XLSX | ✅ FULL (backend + UI + sidebar) |
| 2 | Per-item notes (POS, KDS, QR)          | ✅ FULL |
| 3 | Product images + safe fallback         | ✅ FULL — visually verified |
| 4 | Discounts with mandatory reason + caps | ✅ FULL — backend + UI page |
| 5 | Invoice customization + QR generation  | ✅ FULL — backend + UI with live preview |
| 6 | Offline-First PWA                       | ✅ Workbox SW + Dexie queue + indicator |
| 7 | Master password protection             | ✅ FULL (bcrypt 12 + 8 backup codes) |
| 8 | RBAC (10 roles + permission matrix)    | ✅ Backend middleware + frontend `<Can />` |
| 9 | WebSocket real-time sync                | ✅ Wired on /api/ws ingress |
| 10| Reports demo_mode bypass               | ✅ Hard override in /api/subscription |
| 11| 25 languages                            | ✅ Scaffold (translation deferred per user) |
| 12| Multi-currency                          | ✅ Live rates (166 currencies including SAR) |

## Persistence & Auto-recovery
- `/app/scripts/bootstrap.sh` — idempotent boot script (priority=1 supervisor program)
  - Creates ALL tables including new ones: `exchange_rates`, `discount_settings`, `discount_logs`, `invoice_settings`, `master_passwords`
  - Adds missing columns: orders.kitchen_ready_at/customer_name/customer_phone/general_note/source, order_items.item_note, products.image_url
  - Seeds 10 default discount caps for demo tenant
  - Sets demo tenant to `demo_mode=TRUE` + enterprise/active subscription
- `/app/pgdata` stores Postgres data → survives container resets

## Next Action Items
1. **P0** Paddle production keys (currently sandbox/mock) — required only when moving past investor demo into real billing.
2. **P1** Translate 23 stub locales (deferred by user request).
3. **P1** Wire `<Can />` across remaining destructive buttons (categories, inventory, suppliers, customers, staff).
4. **P2** Web Push via VAPID for cross-device "order ready" notifications (currently same-tab only).
5. **P2** Cloudflare R2 / S3 image upload for CDN-served product images.

## Mocked
- **Paddle billing** — placeholder keys only. Sandbox mode returns mocked checkout URLs and the webhook handler accepts unsigned events. Will flip to live when real keys are supplied.

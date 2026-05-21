# FOODPRO POS — PRD & Implementation Status

## Original Problem Statement
نظام إدارة مطاعم متكامل **FOODPRO POS** متعدد المستأجرين مع POS, KDS, Inventory, Customers, QR Menus, Auth, AI Chatbot، نظام اشتراكات Paddle SaaS، رفع صور المنتجات، QR session timeout، وميزات SaaS متقدمة. The user demanded a 12-feature mega-spec be delivered (QR orders, item notes, image fixes, discounts/coupons, invoice customization, offline-first, master password, RBAC, real-time sync, demo mode, 25 languages, multi-currency).

## Tech Stack
- Node 20 + pnpm 9.15.5 monorepo, Express 5 TS ESM (8001), React 19 + Vite 7 (3000), PostgreSQL 15 + Drizzle/RLS
- AI sidecar: Python FastAPI + emergentintegrations (Claude Haiku 4.5)
- Payments: Paddle Billing v2 (HMAC + mock fallback)
- Persistence: `/app/pgdata` (survives container rebuilds) + supervisor bootstrap
- Realtime: WebSocket (`ws`) attached to HTTP server at **`/ws`** AND **`/api/ws`** (so it traverses the K8s ingress)
- Offline / PWA: vite-plugin-pwa + Workbox + Dexie.js (IndexedDB) for catalog cache + replay queue
- i18n: react-i18next with **25 languages** registered (en + ar + 23 stub locales)

## Recent Sessions

### 2026-02-21 (continued) — Realtime + Multi-currency + PWA + i18n + RBAC
- ✅ **Real-time WebSocket** wired across orders/kitchen mutations (alongside SSE). `socketBroker.emit` fires on:
  `order:created`, `order:updated`, `order:cancelled`, `order:completed`, `order:ready`,
  `ticket:updated`, `product:available/unavailable`, `inventory:low`, `stats:updated`.
  WS server now uses `noServer` upgrade handler accepting both `/ws` and `/api/ws` (the latter for ingress).
- ✅ **Multi-currency** with live rates. `/api/exchange-rates` route fetches from `api.frankfurter.dev` + `open.er-api.com`
  **merged** (union, not fallback) so all 160+ currencies are covered including SAR/AED/KWD/etc. Auto-refresh every 60 min.
  Frontend `CurrencyProvider` merges live rates into the static `CURRENCIES` list and re-renders all prices via `format()`.
- ✅ **PWA + Offline-First**. `vite-plugin-pwa` generates `sw.js` with Workbox caching:
  - StaleWhileRevalidate for `/api/products`, `/api/categories`
  - CacheFirst for `/api/uploads/*` (images, 30 days)
  - CacheFirst for Google Fonts
  - Navigation fallback to `/index.html` (excluding `/api/*`)
  Dexie IndexedDB layer (`/app/artifacts/foodoro/src/lib/offline-db.ts`) caches products and queues mutations
  (`order:create`, `order:complete`, `product:update`). `useOnlineStatus` hook auto-flushes the queue when connectivity returns.
  Floating `<OfflineIndicator />` shows pending count.
- ✅ **25-language i18n**. `SUPPORTED_LANGUAGES` matrix in `src/i18n/languages.ts` covers EN, AR, ES, FR, DE, ZH, JA, HI, PT, RU, IT, KO, TR, NL, PL, SV, ID, TH, VI, EL, HE, FA, UR, BN, SW.
  RTL languages (AR, HE, FA, UR) flip `<html dir>` automatically. Language picker dropdown in the layout (with flag + native + English name).
  Stub locales currently inherit English copy; ready for a translation pipeline drop-in.
- ✅ **RBAC**. 10-role permission matrix:
  super_admin / owner / manager / cashier / waiter / kitchen / bar / accountant / inventory / viewer.
  Frontend `<Can perm="…" />` wrapper + `hasPermission()` helper. Backend `requirePermission()` middleware mirrors the same matrix.
- ✅ **Discount route alias** — `/api/discounts/settings` now exists as an alias of `/api/discount-settings`.
- ✅ **Product image fallback** — POS/Products pages now have `onError` handlers that swap broken images for the product-initial badge.
- ✅ **Bootstrap.sh** updated to provision the `exchange_rates` table and refresh-on-boot.
- ✅ Demo products seeded (شاي كرك, قهوة عربية).

### Earlier (this session)
- ✅ `tenants.demo_mode` flag — bypasses ALL feature gating + read-only checks for investor showcase
- ✅ Order schema extensions: `order_items.item_note`, `orders.general_note`, `orders.customer_name/phone`, `orders.kitchen_ready_at`, `orders.payment_method`, `orders.source`
- ✅ QR Orders router `/api/qr-orders` — list / customer-info / pay / XLSX export (ExcelJS)
- ✅ Discounts router `/api/discounts/*` + `/api/orders/:id/discount` — mandatory reason, role-based caps, full `discount_logs` audit table
- ✅ Invoice settings `/api/invoice-settings` + `/api/invoice-settings/qr` — paper sizes 58/80mm/A5/A4, welcome message, footer, logo
- ✅ Master password router `/api/security/master-password/*`
- ✅ Per-item notes on QR menu, customer name/phone capture step

### 2026-02-20 — Paddle SaaS Subscriptions
- ✅ 3 plans (Starter $149 / Growth $349 / Enterprise $999), 14-day trial, feature gating, HMAC webhooks (idempotent)
- ✅ `/billing` page with usage bars, plan grid, invoices, cancel/resume + `<SubscriptionBanner />`
- ✅ Product image upload (multipart 4 MB + base64 + URL paste) and QR 5-minute session window

### Earlier
- ✅ Restaurant-only signup (25 business types), AI Chat (Claude Haiku 4.5 via Emergent Universal Key), Custom JWT + Emergent Google Auth, FOODORO→FOODPRO rename, tax-inclusive math, marketing landing page

## Persistence & Auto-recovery
- `/app/scripts/bootstrap.sh` — idempotent boot script (priority=1 supervisor program)
- `/app/pgdata` stores Postgres data → survives container resets
- backend & frontend wait for `/tmp/foodpro-bootstrap.done` before starting

## Demo Credentials
- URL: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- Email: `demo@foodpro.com`  ·  Password: `Demo2026!`
- Plan: Enterprise / Active  +  `demo_mode = TRUE`

## Status: 12-Feature Mega-Spec Completion
| # | Feature                                | Status |
|---|----------------------------------------|--------|
| 1 | QR orders + customer info + pay + XLSX | ✅ Done (backend + UI) |
| 2 | Per-item notes (POS, KDS, QR)          | ✅ Done |
| 3 | Product images + safe fallback         | ✅ Done |
| 4 | Discounts with mandatory reason + caps | ✅ Done + alias route |
| 5 | Invoice customization + QR generation  | ✅ Backend ready; UI page deferred |
| 6 | **Offline-First PWA**                   | ✅ Workbox SW + Dexie queue + indicator |
| 7 | Master password protection             | ✅ Done |
| 8 | **RBAC** (10 roles + permission matrix) | ✅ Backend middleware + frontend `<Can />` |
| 9 | **WebSocket real-time sync**            | ✅ Wired across orders/kitchen, /api/ws ingress |
| 10| Reports demo_mode bypass               | ✅ Done |
| 11| **25 languages**                        | ✅ Scaffold + picker (stubs need translation) |
| 12| **Multi-currency**                      | ✅ Live rates (Frankfurter + open.er-api union) |

## Testing
- iteration_2.json: **100% backend pass (18/18)** — all 3 issues from iteration_1 fixed and verified.
- Pytest file: `/app/backend/tests/test_foodpro_backend.py`

## Next Action Items (prioritised)
1. **P0** — Translate the 23 stub locales (drop-in via a TMS or LLM batch). Keys & structure already in place.
2. **P0** — UI pages for `/settings/discounts` + `/settings/invoice` (backend ready).
3. **P0** — Paddle production keys to flip from mock → live billing.
4. **P1** — Wire `<Can />` across all destructive buttons (delete product/category, refund, void order, etc.).
5. **P1** — Service Worker push notifications (Web Push API) for "Order Ready" alerts.
6. **P2** — Cloudflare R2 / S3 image upload for CDN-served product images.
7. **P2** — Visual product-images regression test on the seeded products (smoke test only).

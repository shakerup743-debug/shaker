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

### 2026-02-23 — QR Fraud Protection + WhatsApp OTP
- ✅ **NEW FEATURE — Full QR Order Fraud Protection (7-layer)**:
  - DB: 5 new tables — `qr_scans`, `qr_order_security`, `whatsapp_otps`, `fraud_attempts`, `security_blacklist`
  - 7 risk factors: blacklist hit (+100 critical), device fraud history (+35), unusual hour (+10), QR repetition (+25), device-token farming (+25), order anomalies (high-value +15, item count +15, missing name +25), behaviour patterns (same name from many IPs +25, unpaid pileup +15)
  - Thresholds: **≥40** → WhatsApp OTP required, **≥60** → cashier manual approval, **≥80** → auto-block + 24h auto-blacklist of phone + device
  - Server-side device fingerprint (SHA-256 of UA + lang + tz + screen + client hints)
  - **Saudi phone validation** (05XXXXXXXX or +9665XXXXXXXX, normalized to +966 form)
  - **Customer name + phone now MANDATORY** on all QR orders (HTTP 400 with `IDENTITY_REQUIRED`/`PHONE_INVALID`)
  - **WhatsApp OTP** send/verify with single-use + 5 attempts + 10-min expiry. Provider stubbed (logs to backend stdout) — ready to wire Twilio/Meta when credentials are provided
  - Auto-blacklist on critical risk + on cashier rejection (7 days)
  - Admin **Fraud Monitoring page** at `/security/fraud` — stats, pending approvals, recent attempts, blacklist management
  - Cashier approve/reject endpoints with status guards (`pending_approval` only) + 404 on no-match
  - Kitchen ticket auto-deleted when order is FRAUD_BLOCKED
- ✅ **45/46 backend tests pass** (22/22 fraud + 23/24 regression). One regression false-positive (testing agent's local issue, manually re-verified working)

## Next Action Items
1. **P0** Wire real WhatsApp provider (Twilio recommended) — the integration is one method swap in `/app/artifacts/api-server/src/lib/qr-security.ts::sendWhatsAppOtp`. Needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
2. **P0** Tax-model harmonisation: `/api/orders` inclusive 15/115 vs `/api/public/orders` exclusive 15% — pick one.
3. **P1** Wire option-group inventory deduction (Family Size = different SKU).
4. **P1** Score evaluation BEFORE order INSERT (currently scored after insert + cleanup on block).
5. **P1** QR Menu Metrics dashboard (languages/currencies of customers).
6. **P1** Cloudflare R2 / S3 for product images.
7. **P2** Paddle production keys (currently sandbox/mock).
8. **P2** Translate 23 stub locales.
9. **P2** Web Push via VAPID.

### 2026-02-23 — Auth Fix + Product Variants/Options (full + delta pricing)
- ✅ **CRITICAL auth fix**: brute-force lockout was IP-only → blocked all users on shared NAT (cause of "can't login after logout" bug). Switched to **per (email+ip) primary lock at 6 fails** + IP-only DoS guard at 50. Successful login clears prior failures.
- ✅ **NEW FEATURE — Product Variants/Options with dual pricing modes**:
  - `priceMode: "full"` → option REPLACES the base price (Small=20, Medium=30, Large=40)
  - `priceMode: "delta"` → option ADDS to base/effective price (Cheese=+5)
  - Schema: `products.option_groups JSONB`, `order_items.selected_options JSONB`, `order_items.base_unit_price NUMERIC`
  - Shared `resolveOptionPricing` helper used by both `/api/orders` and `/api/public/orders` (anti-tamper)
  - Required group missing → HTTP 400 with friendly Arabic message
  - Full-mode without `price` field → rejected at product save
  - Single-select group receiving 2 picks at order time → rejected
  - POS + QR menu picker shows absolute price for "full" items, "+price" for "delta" items
  - Cart shows option summary under each line, invoice prints them too
- ✅ 24/24 backend pytest cases green

## Next Action Items
1. **P0** Address tax-model inconsistency: `/api/orders` treats VAT as INCLUSIVE (15/115), `/api/public/orders` treats it as EXCLUSIVE. Same product on the two paths produces different totals — pick one.
2. **P1** Wire option-group inventory deduction (Family Size → deduct family-size SKU).
3. **P1** QR Menu Metrics dashboard (which languages/currencies QR customers actually use).
4. **P1** Cloudflare R2 / S3 image upload for CDN-served product + option images.
5. **P2** Paddle production keys (currently sandbox/mock).
6. **P2** Translate 23 stub locales (deferred by user request).
7. **P2** Web Push via VAPID for cross-device "order ready" notifications.

### 2026-02-21 — Investor-Demo Sprint

### 2026-02-21 — Investor-Demo Sprint

## Mocked
- **Paddle billing** — placeholder keys only. Sandbox mode returns mocked checkout URLs and the webhook handler accepts unsigned events. Will flip to live when real keys are supplied.

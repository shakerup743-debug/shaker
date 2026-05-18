# FOODORO POS — PRD & Implementation Status

## Original Problem Statement
نظام إدارة مطاعم متكامل **FOODORO POS** (v2.0) من Replit، يجب تشغيله كاملاً في بيئة Emergent مع:
1. تشغيل النظام بنسبة 100%
2. تنفيذ نظام QR Menu (ميزة جوهرية)
3. تسجيل الدخول عبر Google + Apple
4. تنفيذ جميع الميزات المتبقية

## Tech Stack (After Migration to Emergent)
- **Node.js**: v20.20.2
- **pnpm**: 9.15.5 (monorepo workspace)
- **PostgreSQL**: 15.18
- **Backend**: Express 5, TypeScript ESM
- **Frontend**: React 19 + Vite 7, port 3000
- **DB**: postgresql://foodoro:foodoro123@localhost:5432/foodoro_db
- **Auth**: JWT + Emergent-managed Google OAuth (Apple disabled — needs Apple Developer Account)
- **Supervisor**: postgres, backend (8001), frontend (3000), mongodb

## What's Been Implemented (Session 2 — Polish) — 2026-01

### Authentication Cleanup
- ✅ **Removed seeded demo user** (`admin@foodoro.local`) and all demo data
- ✅ **Database wiped clean** — no users, no tenants, fresh start
- ✅ **No auto-fill in sign-in fields** — production-ready
- ✅ **Removed Apple Sign-In button** (no Apple Developer credentials available)
- ✅ **Improved Google Sign-In UX**:
  - Polished "Redirecting to Google..." loading screen with branded spinner
  - Clear messaging: "Choose your Google account, then you'll be returned to your dashboard"
  - 400ms delay before redirect to show the transition clearly
- ✅ **New Sign-Up endpoint**: `POST /api/auth/signup`
  - Validates email format, password length ≥ 8
  - Creates new tenant + owner user atomically
  - Auto-seeds 4 starter categories (Beverages, Main Dishes, Appetizers, Desserts)
  - Returns JWT immediately (auto-login after signup)
- ✅ **New beautiful Sign-Up page**: `/sign-up`
  - Two-step wizard with progress bar (1/2 → 2/2)
  - Step 1: Restaurant name (with "You will be primary owner" reassurance)
  - Step 2: Full name, email, password, confirm password (with validation)
  - Polished UI matching sign-in design
- ✅ **Google OAuth also seeds starter categories** for first-time Google users

### Visual Improvements
- ✅ Gradient logo (orange→amber)
- ✅ Decorative blurred gradients in background
- ✅ Backdrop-blur card with subtle white/5 borders
- ✅ Smooth hover animations (`hover:scale-[1.01]`)
- ✅ Animated Google logo with orbiting spinner during redirect
- ✅ Clear field placeholders and focus rings

## Owner / Tenant Logic
- **First user who signs up** → becomes **owner** of their own brand-new tenant
- Each email creates a SEPARATE restaurant (multi-tenant)
- New tenants start with: SAR currency, 15% VAT, starter plan, 4 sample categories
- Owner has full access to all modules; can later invite staff with limited roles

### Infrastructure
- ✅ Installed PostgreSQL 15 + initialized cluster + auto-start via supervisor
- ✅ Installed pnpm 9.15.5 (Node 20 compatible) + 1198 dependencies
- ✅ Created `foodoro_db` + applied 37-table Drizzle schema
- ✅ Applied RLS migrations (tenant isolation) + all SQL migrations
- ✅ Configured supervisor to manage all services

### Backend (api-server, Express 5)
- ✅ Built successfully via esbuild (dist/index.mjs)
- ✅ `/api/healthz` returns `{"status":"ok"}`
- ✅ Clerk middleware gracefully disabled (no real keys)
- ✅ JWT auth via `/api/auth/login` working
- ✅ All `authorize("admin")` updated to `authorize("admin", "owner")` for proper RBAC
- ✅ Increased auth rate limit (200 / 15min) for dev convenience
- ✅ Added `/api/auth/google/session` endpoint — exchanges Emergent session_id for FOODORO JWT
- ✅ CRUD endpoints tested: categories, products, orders, tables, qr, kitchen, etc.

### Frontend (foodoro web, React 19 + Vite 7)
- ✅ Removed Replit-specific Vite plugins (cartographer, dev-banner, runtime-error-modal)
- ✅ Added Vite proxy `/api` → localhost:8001
- ✅ Removed ClerkProvider from App.tsx, using JWT AuthProvider
- ✅ Beautiful new SignInPage with:
  - **Sign in with Google** button (functional, uses Emergent auth)
  - **Sign in with Apple** button (shows informative disabled message)
  - Email/password fallback with demo credentials
- ✅ Created Clerk shim (`src/lib/clerk-shim.ts`) — adapts AuthContext to Clerk-like API
- ✅ Patched 24 files to use shim instead of `@clerk/react`
- ✅ Fixed billing page crash (graceful handling of plan-gated endpoints)

### QR Menu System (Customer Self-Service)
- ✅ Tables created (T-1 through T-4)
- ✅ QR Code Management page at `/qr-menu` — shows all tables + Generate/View/Regen/Delete actions
- ✅ Backend `/api/qr` endpoints (admin) + `/api/public/qr/:token` (customer-facing)
- ✅ Customer Order page at `/order?token=qr_XXX` — beautiful mobile-friendly UI with:
  - Restaurant name + table number
  - Language toggle (AR/EN)
  - Cart icon
  - Category filters
  - 12 products grouped by category with colors
  - Add buttons per product
  - SAR pricing

### Pages Verified Working (22 of 22)
| Status | Pages |
|--------|-------|
| ✅ OK | POS, Kitchen, Products, Inventory, Reports, Tables, Customers, Suppliers, Coupons, Loyalty, Staff, Audit, Security, Cashier Shifts, Cashier Amendments, Tenant Settings, Settings, Notifications, Floor Plan, Customer Analytics, Financial Overview, Reports Advanced, Payments, Branches, Billing, QR Menu, Customer Order |

### Test Data Seeded
- Tenant: id=1, slug=demo, Demo Restaurant, SAR, 15% VAT
- User: admin@foodoro.local / admin123 (role=owner)
- 4 Categories (المشروبات / الوجبات الرئيسية / المقبلات / الحلويات)
- 12 Arabic products with SAR prices
- 4 Tables (T-1 through T-4)
- 1 QR Code on T-1 (active, 1 scan)
- 1 Order ORD-2110-52 (status=ready, 81 SAR with 10.57 SAR VAT)

## End-to-End Flow Verified
1. ✅ Login → POS opens
2. ✅ Click products → cart accumulates
3. ✅ Subtotal + VAT 15% calculated correctly
4. ✅ Click Cash → order created in database with status="ready"
5. ✅ Order appears in Orders list via API
6. ✅ QR code generated for table
7. ✅ Customer can scan → load menu → see all products

## Known Limitations / Future Work
- 🟡 **Apple Sign-In**: requires Apple Developer Account ($99/year). Button shows informative message.
- 🟡 **Stripe Billing**: needs STRIPE_SECRET_KEY for real payments
- 🟡 **Mobile App (Expo)**: not started in this session
- 🟡 **SSE Real-time**: broker works but multi-client stress test not performed
- 🟡 **Order amendments**: API exists, not deeply tested via UI

## Demo Credentials
- **URL**: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- **Email**: admin@foodoro.local
- **Password**: admin123
- **Tenant**: Demo Restaurant
- **Google Login**: available (button works)
- **Apple Login**: requires keys (button shows message)
- **QR Customer URL**: `/order?token=qr_4CT7m2MoxIZPlKPoAAkd3k` (Table T-1)

## Next Action Items
### P0
- End-to-end test customer journey: scan QR → add to cart → submit order → kitchen receives
- Test order amendment flow (discount/cancel with master password)

### P1
- Provide Apple Developer credentials to enable Apple Sign-In
- Configure Stripe keys for billing
- Test multi-tenant isolation by creating 2 tenants

### P2
- Run mobile app
- Add proper error boundaries on remaining edge cases
- Performance tuning + production build

## Architecture
```
Browser → Vite (3000) → /api/* proxy → Express (8001) → PostgreSQL (5432)
                                                    ↓
                                              Drizzle ORM + RLS
                                                    ↓
                                          tenant-scoped queries
```

## File Structure
```
/app/
├── artifacts/
│   ├── api-server/          # Express 5 backend (port 8001)
│   │   ├── src/routes/
│   │   │   ├── google-auth.ts  # NEW — Google session exchange
│   │   │   └── ...
│   │   └── dist/
│   ├── foodoro/             # React + Vite frontend (port 3000)
│   │   ├── src/
│   │   │   ├── App.tsx              # JWT auth orchestration
│   │   │   ├── pages/sign-in.tsx    # Google + Apple + Email
│   │   │   ├── lib/clerk-shim.ts    # Clerk → JWT adapter
│   │   │   └── contexts/auth.tsx
│   │   └── vite.config.ts
│   └── foodoro-mobile/      # Expo (not running)
├── lib/db/                  # Drizzle schema + migrations
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

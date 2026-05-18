# FOODORO POS — PRD & Implementation Status

## Original Problem Statement
المستخدم لديه نظام إدارة مطاعم متكامل **FOODORO POS** (v2.0) تم تطويره أصلاً على منصة Replit. النظام يتضمن:
- Backend Express 5 + TypeScript + PostgreSQL + Drizzle ORM
- Frontend React 19 + Vite 7 + Tailwind + shadcn/ui
- Mobile App (Expo React Native)
- 37 جدول قاعدة بيانات مع RLS لعزل المستأجرين
- 30+ API routes (auth, orders, kitchen, inventory, products, customers, loyalty, security, etc.)
- 35+ صفحة Frontend
- ثنائي اللغة (عربي/إنجليزي) مع دعم RTL
- مصادقة Clerk (Replit-managed)
- ضريبة القيمة المضافة 15% (السوق السعودي)

طلب المستخدم: تشغيل النظام في بيئة Emergent والتأكد من عمله بنسبة 100%.

## Tech Stack (After Migration to Emergent)
- **Node.js**: v20.20.2
- **pnpm**: 9.15.5 (monorepo workspace)
- **PostgreSQL**: 15.18 (Debian)
- **Backend**: Express 5, TypeScript ESM, builds to /app/artifacts/api-server/dist
- **Frontend**: React 19 + Vite 7, port 3000
- **DB**: postgresql://foodoro:foodoro123@localhost:5432/foodoro_db
- **Auth**: JWT (replaced Clerk with shim that adapts JWT auth to Clerk-like API)
- **Supervisor**: manages postgres, backend (port 8001), frontend (port 3000), mongodb

## What's Been Implemented (Migration Work) — 2026-01

### Infrastructure Setup
- ✅ Installed PostgreSQL 15 + initialized cluster
- ✅ Installed pnpm 9.15.5 (Node 20 compatible)
- ✅ Installed all 1198 dependencies via pnpm
- ✅ Created database `foodoro_db` with user `foodoro`
- ✅ Pushed full Drizzle schema (37 tables)
- ✅ Applied RLS migrations (tenant isolation)
- ✅ Applied all SQL migrations (cashier-system, security-tables, master-password, etc.)
- ✅ Configured supervisor for Node.js backend + Vite frontend + Postgres

### Backend (api-server)
- ✅ Built successfully via esbuild (dist/index.mjs)
- ✅ Health endpoint working: `/api/healthz` → `{"status":"ok"}`
- ✅ Removed Clerk middleware when no real Clerk keys (graceful fallback)
- ✅ Made `getAuth(req)` safe against errors
- ✅ JWT auth via `/api/auth/login` working
- ✅ Tested CRUD endpoints: categories, products, orders, tables — all working
- ✅ RLS isolation working (tenantId scoping via app.current_tenant_id)

### Frontend (foodoro web)
- ✅ Removed Replit-specific Vite plugins (cartographer, dev-banner, runtime-error-modal)
- ✅ Added Vite proxy: /api → localhost:8001
- ✅ Removed ClerkProvider from App.tsx, replaced with JWT-based AuthProvider
- ✅ Replaced SignInPage with custom email/password form
- ✅ Created Clerk shim (`src/lib/clerk-shim.ts`) that adapts our JWT AuthContext to Clerk's API
- ✅ Patched 24 files: redirected `from "@clerk/react"` → `from "@/lib/clerk-shim"`
- ✅ Frontend renders correctly: POS, sidebar, all UI components

### Test Data Seeded
- Tenant: id=1, slug=demo, "Demo Restaurant", SAR currency, 15% VAT
- User: admin@foodoro.local / admin123 (role=owner, tenantId=1)
- 4 Categories: المشروبات / الوجبات الرئيسية / المقبلات / الحلويات
- 12 Products with Arabic names + SAR prices

## What's Working End-to-End
- 🟢 Login (JWT, /api/auth/login)
- 🟢 Authenticated routes (/api/auth/me, /api/categories, /api/products, /api/orders, /api/tables, etc.)
- 🟢 POS page renders products grid
- 🟢 Sidebar navigation with all sections (Management panel, Kitchen, Tables, etc.)
- 🟢 RTL layout for Arabic
- 🟢 SAR currency formatting
- 🟢 VAT 15% calculation visible
- 🟢 Real-time SSE broker attached (`/api/events`)

## Known Issues / Not Yet Verified
- 🟡 Clerk PROXY paths still exist in app.ts (harmless when Clerk disabled)
- 🟡 Mobile app (Expo) — not started in this session
- 🟡 Stripe billing webhook — needs real keys
- 🟡 SSE real-time events — broker works, but not stress-tested with multiple clients
- 🟡 Order placement → kitchen ticket flow — not yet end-to-end tested via UI
- 🟡 ManagementPanel pages (Inventory, Reports, Customers, etc.) — load but not deeply tested
- 🟡 Some pages may still have UI bugs (not all 35+ pages verified)

## Demo Credentials
- **URL**: https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
- **Email**: admin@foodoro.local
- **Password**: admin123
- **Tenant**: Demo Restaurant (slug=demo)

## Next Steps (Backlog)

### P0 — Critical
- End-to-end test: place order via POS → check kitchen ticket
- Verify all sidebar pages render without errors
- Test order amendment & payment flows

### P1 — Important
- Add proper Clerk keys if Google OAuth is needed (currently disabled gracefully)
- Test Inventory management + stock decrement on order completion
- Test Cashier shift open/close flow

### P2 — Nice to have
- Run Mobile app (Expo)
- Set up Stripe for billing
- Configure Sentry for production monitoring
- Build production bundles + serve via reverse proxy

## File Structure
```
/app/
├── artifacts/
│   ├── api-server/          # Express 5 (port 8001) — Node.js backend
│   │   ├── src/
│   │   ├── dist/            # Built output (esbuild)
│   │   └── .env
│   ├── foodoro/             # React + Vite (port 3000) — web frontend
│   │   ├── src/
│   │   │   ├── App.tsx              # JWT auth (Clerk removed)
│   │   │   ├── pages/sign-in.tsx    # Custom email/password form
│   │   │   ├── lib/clerk-shim.ts    # Clerk API adapter → JWT
│   │   │   └── contexts/auth.tsx    # JWT AuthProvider
│   │   ├── vite.config.ts           # Replit plugins removed + /api proxy
│   │   └── .env
│   └── foodoro-mobile/      # Expo (not running)
├── lib/
│   ├── db/                  # Drizzle schema + migrations
│   ├── api-spec/            # OpenAPI 3.1
│   ├── api-zod/             # generated Zod schemas
│   └── api-client-react/    # generated React Query hooks
├── memory/
│   ├── PRD.md               # this file
│   └── test_credentials.md
└── /etc/supervisor/conf.d/supervisord.conf  # supervises postgres + backend + frontend
```

## Architecture Diagram
```
Browser → Vite (3000) → /api/* proxy → Express (8001) → PostgreSQL (5432)
                                                    ↓
                                              Drizzle ORM + RLS
                                                    ↓
                                          tenant-scoped queries
```

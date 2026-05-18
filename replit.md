# FOODORO POS

Restaurant POS & Kitchen Management System — bilingual (Arabic / English), RTL-aware, production-ready backend, Role-Based Access Control, and real-time SSE updates.

## Run & Operate

```bash
pnpm --filter @workspace/api-server run dev   # API server (port 8080)
pnpm --filter @workspace/foodoro run dev      # Frontend (port 24753)
pnpm --filter @workspace/db run push          # Push DB schema changes (dev only)
pnpm --filter @workspace/api-spec run codegen # Regenerate API hooks from OpenAPI spec
pnpm run typecheck                            # Full typecheck across all packages
```

## Architecture

```
artifacts/
  api-server/          Express 5 REST API (port 8080)
  foodoro/             React + Vite SPA (port 24753)
lib/
  db/                  Drizzle ORM schema + migrations
  api-spec/            OpenAPI 3.1 spec (single source of truth)
  api-zod/             Zod schemas generated from OpenAPI (server validation)
  api-client-react/    React Query hooks generated from OpenAPI (client calls)
```

## Stack

- **Frontend**: React 18, Vite, Tailwind CSS, shadcn/ui, Wouter (routing), Framer Motion, Recharts, i18next (AR/EN)
- **Backend**: Express 5, Node.js 24, TypeScript ESM, Pino logger
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: JWT (jose) + bcryptjs, 24h access tokens stored in localStorage
- **Real-time**: Server-Sent Events (SSE) broker — order created and ticket status events
- **Security**: Helmet (headers), express-rate-limit (20 auth req/15min, 300 API req/min), CORS
- **Validation**: Zod (server), generated Zod schemas in `@workspace/api-zod`
- **Codegen**: Orval from OpenAPI spec

## Where things live

| Concern | File |
|---------|------|
| DB schema | `lib/db/src/schema/*.ts` |
| OpenAPI contract | `lib/api-spec/openapi.yaml` |
| JWT sign/verify | `artifacts/api-server/src/lib/jwt.ts` |
| SSE event bus | `artifacts/api-server/src/lib/sse-broker.ts` |
| Auth middleware | `artifacts/api-server/src/middleware/authenticate.ts` |
| Role middleware | `artifacts/api-server/src/middleware/authorize.ts` |
| Auth context (FE) | `artifacts/foodoro/src/contexts/auth.tsx` |
| SSE hook (FE) | `artifacts/foodoro/src/hooks/use-sse.ts` |
| i18n config | `artifacts/foodoro/src/i18n/index.ts` |
| Translations | `artifacts/foodoro/src/i18n/locales/{en,ar}.json` |

## Auth (Web)

Web authentication uses **Clerk** (Replit-managed). Google OAuth + email/password are both available on the sign-in page. All authenticated users see all features (no RBAC restrictions on the frontend).

Backend bridges Clerk sessions → local users via `clerk_id` column. An admin must create the user via `POST /api/users` before their first sign-in; no automatic JIT provisioning (removed to prevent silent tenant assignment).

Mobile app (`foodoro-mobile`) still uses custom JWT auth — leave as-is.

**Clerk app:** `app_3DgOV5qBUVggwvNG6FQk4X6MJBf`
**Required secrets:** `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`

## Real-time (SSE)

`GET /api/events` streams Server-Sent Events. Events emitted:
- `order:created` — when a new order is placed via POS
- `ticket:updated` — when kitchen staff changes a ticket status

The Kitchen page subscribes via `useSse()` hook and auto-refreshes without polling. Polling kept as fallback (30s interval).

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | ≥32 char secret for signing JWTs | ✅ (set via Replit secrets) |
| `PORT` | Server port (set by Replit workflow) | ✅ |
| `NODE_ENV` | `development` / `production` | auto-set |

## API Routes

All routes under `/api`. Auth routes are public; all others require `Authorization: Bearer <token>`.

```
POST   /api/auth/login         → { token, user }
GET    /api/auth/me            → { user }

GET    /api/events             → SSE stream

GET    /api/categories
POST   /api/categories
PUT    /api/categories/:id
DELETE /api/categories/:id

GET    /api/products
POST   /api/products
PUT    /api/products/:id
PATCH  /api/products/:id/toggle
DELETE /api/products/:id

POST   /api/orders
GET    /api/orders
GET    /api/orders/:id
PATCH  /api/orders/:id
POST   /api/orders/:id/complete

GET    /api/kitchen/tickets
PATCH  /api/kitchen/tickets/:id/status

GET    /api/inventory
POST   /api/inventory
PATCH  /api/inventory/:id/adjust

GET    /api/reports/dashboard
GET    /api/reports/daily?date=YYYY-MM-DD
GET    /api/reports/hourly?date=YYYY-MM-DD
GET    /api/reports/top-products?date=YYYY-MM-DD&limit=N

GET    /api/users              (admin only)
POST   /api/users              (admin only)
PATCH  /api/users/:id          (admin only)
```

## Scalability Roadmap

### Phase 1 — Current (done ✅)
- Full CRUD REST API
- JWT auth + RBAC
- Real-time SSE
- Security middleware
- Bilingual AR/EN + RTL

### Phase 2 — Near term
- Refresh token rotation (Redis)
- WebSocket upgrade for bi-directional real-time
- PWA / Service Worker for offline mode
- Print receipt API (thermal printer via Web USB)
- Inventory auto-deduction on order complete

### Phase 3 — Multi-tenant SaaS
- `tenants` table + `tenant_id` FK on all tables
- Row-level security (PostgreSQL RLS)
- Subdomain routing: `{slug}.foodoro.app`
- Stripe subscription billing per tenant
- Tenant admin portal (manage users, branding, menu)
- Isolated DB schemas per enterprise tenant

### Phase 4 — Enterprise
- Redis caching layer (menu, reports)
- Queue system (BullMQ) for async tasks
- S3/R2 for product images
- Advanced analytics (daily P&L, food cost %)
- Multi-branch support

## Architecture Decisions

- **ESM throughout** — both server and client use ES modules; esbuild bundles for production
- **Contract-first API** — OpenAPI spec is the single source of truth; never edit generated files
- **SSE over WebSocket** — simpler for server→client push; upgrade path to WS exists when bi-directional needed
- **JWT in localStorage** — pragmatic for POS tablets; upgrade to httpOnly cookies for browser apps
- **Drizzle over Prisma** — lighter, SQL-first, better TypeScript inference, no binary dependencies
- **No `zod` direct import in api-server** — use `@workspace/api-zod` re-exports only (esbuild compatibility)

## Multi-Tenant Isolation

### Role model
| Role | Scope |
|------|-------|
| `platform_admin` | Cross-tenant — Foodoro platform staff only. Can list/create/update/delete any tenant via `GET/POST/PATCH/DELETE /api/tenants`. Never granted to restaurant users. |
| `owner`, `admin` | Tenant-scoped. Full access within their own tenant. Cannot see other tenants. |
| all others | Tenant-scoped with reduced permissions per `ROLE_PERMISSIONS`. |

### Tenant context per request
`requireTenant` middleware (applied globally after `authenticate` in `routes/index.ts`) acquires a dedicated `pg.PoolClient`, runs `SET app.current_tenant_id = '<id>'`, and exposes `req.db` (Drizzle instance bound to that client). The variable is `RESET` before the client is returned to the pool.

### RLS rollout (run once per environment)
```bash
# 1. Ensure tenant_id columns exist on all core tables
psql "$DATABASE_URL" -f lib/db/src/migrations/add-tenant-id-to-core-tables.sql

# 2. Enable FORCE RLS + create tenant_isolation policies (core tables)
psql "$DATABASE_URL" -f lib/db/src/migrations/rls-tenant-isolation.sql

# 3. Enable RLS on shared tables (customers, restaurant_tables, coupons)
psql "$DATABASE_URL" -f lib/db/src/migrations/add-tenant-id-to-shared-tables.sql

# 4. Enable RLS on extended tables (audit_logs, branches, cashier_shifts, etc.)
psql "$DATABASE_URL" -f lib/db/src/migrations/rls-extended-isolation.sql

# 5. Create limited-privilege app role (required for RLS to actually filter)
psql "$DATABASE_URL" -f lib/db/src/migrations/create-app-role.sql
```
All scripts are idempotent. Tables with RLS: `categories`, `products`, `orders`, `kitchen_tickets`, `inventory`, `customers`, `restaurant_tables`, `coupons`, `audit_logs`, `branches`, `cashier_shifts`, `master_passwords`, `order_amendments`, `product_availability_log`, `protected_operation_logs`, `user_sessions`, `waste_logs`, `webhooks`.

**Critical:** RLS only works when `requireTenant` middleware runs. It sets `app.current_tenant_id` AND switches to `foodoro_app` role (non-superuser). The postgres superuser bypasses RLS — the limited role is what makes policies effective.

### Isolation scope (Phase 2 — Task #24)
Core tables isolated: categories, products, orders, kitchen_tickets, inventory.
Shared/cross-tenant tables (no tenant_id yet): customers, coupons, tables, suppliers.
Follow-up tasks #28, #29, #30 extend isolation to remaining domains.

## Gotchas

- Do NOT import `zod` or `zod/v4` directly in `api-server`. Use `@workspace/api-zod` imports only.
- Do NOT run `pnpm dev` at workspace root — use per-artifact workflow commands.
- `border-s`/`border-e` instead of `border-l`/`border-r` for RTL-safe Tailwind borders.
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`.
- After adding a new DB table, run `pnpm --filter @workspace/db run push` then re-seed if needed.
- After adding a new tenant-scoped table, add it to `add-tenant-id-to-core-tables.sql` and `rls-tenant-isolation.sql`.

## User Preferences

- Theme: Royal Orange dark (#E67E22 primary, #111827 background)
- Currency: SAR (ر.س in Arabic)
- Tax Rate: 15% VAT
- Bilingual: Arabic (RTL) + English (LTR), toggle persisted in localStorage `foodoro-lang`

# FOODORO — Enterprise AI Operating System
## Technical Roadmap v1.1
**Classification:** Internal Engineering Document  
**Date:** May 2026  
**Status:** Approved for Phased Execution  
**Revision:** Timelines, costs, and phase details corrected to realistic estimates based on comparable SaaS projects

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Analysis](#2-current-system-analysis)
3. [Target Architecture](#3-target-architecture)
4. [Architectural Transformation Strategy](#4-architectural-transformation-strategy)
5. [Services Breakdown](#5-services-breakdown)
6. [Event Bus Architecture](#6-event-bus-architecture)
7. [CQRS Strategy](#7-cqrs-strategy)
8. [Event Sourcing Strategy](#8-event-sourcing-strategy)
9. [AI Infrastructure Architecture](#9-ai-infrastructure-architecture)
10. [Workflow Engine Architecture](#10-workflow-engine-architecture)
11. [Real-time Architecture](#11-real-time-architecture)
12. [Offline-First Architecture](#12-offline-first-architecture)
13. [Sync Engine Architecture](#13-sync-engine-architecture)
14. [AI Agents Architecture](#14-ai-agents-architecture)
15. [Database Scaling Strategy](#15-database-scaling-strategy)
16. [Multi-Tenant Strategy](#16-multi-tenant-strategy)
17. [Security Architecture](#17-security-architecture)
18. [DevOps Architecture](#18-devops-architecture)
19. [Monitoring & Observability](#19-monitoring--observability)
20. [Disaster Recovery](#20-disaster-recovery)
21. [Testing Strategy](#21-testing-strategy)
22. [Deployment Strategy](#22-deployment-strategy)
23. [Performance Targets](#23-performance-targets)
24. [Estimated Scaling Limits](#24-estimated-scaling-limits)
25. [Cost Estimation](#25-cost-estimation)
26. [Technical Risks](#26-technical-risks)
27. [Migration Strategy](#27-migration-strategy)
28. [Development Phases](#28-development-phases)
29. [Timeline](#29-timeline)
30. [Team Structure](#30-team-structure)
31. [Technology Decisions](#31-technology-decisions)
32. [Future Extensibility](#32-future-extensibility)
33. [System Diagrams](#33-system-diagrams)

---

## 1. Executive Summary

FOODORO is transitioning from a **Modern CRUD SaaS POS** into an **AI-native Enterprise Business Operating System**. This document defines the complete technical architecture, migration path, and execution plan for that transformation.

### Vision Statement
> Build the world's first self-improving, AI-native restaurant operating system — a platform that does not merely record business data, but understands it, predicts outcomes, and autonomously acts on behalf of the business.

### What Changes
| Dimension | Today | Target |
|-----------|-------|--------|
| Architecture | REST CRUD Monolith | Event-Driven Microservices |
| Intelligence | Static Reports | AI-powered Predictions & Autonomous Agents |
| Real-time | SSE (server→client only) | Full WebSocket + Presence + Live Collaboration |
| Offline | None | Full Offline-First with Sync Engine |
| Automation | Manual workflows | Visual Workflow Builder + Autonomous Agents |
| Data Model | Relational CRUD | Event Store + CQRS + Read Projections |
| Tenancy | Basic RLS | Full Platform Isolation + Marketplace |

### Realistic Summary (v1.1 Corrections)
| Metric | Previous Estimate (v1.0) | Realistic Estimate (v1.1) |
|--------|--------------------------|---------------------------|
| Total timeline | 64 weeks (~16 months) | **93 weeks (~22 months)** |
| Phase 0 | 6 weeks | **10 weeks** |
| Phase 1 | 8 weeks | **11 weeks** |
| Phase 2 | 8 weeks | **12 weeks** |
| Phase 3 | 10 weeks | **14 weeks** |
| Phase 4 | 8 weeks | **12 weeks** |
| Phase 5 | 12 weeks | **16 weeks** |
| Phase 6 | 12 weeks | **16 weeks** |
| Infrastructure cost | $400–1,550/month | **$900–2,050/month** (Phase 0–2) |
| Total 22-month budget | not estimated | **~$1.24M USD (~4.65M SAR)** |

> The added buffer per phase accounts for: integration testing with real data, team training on new patterns, code review & rework cycles, and the inherent complexity of distributed systems engineering. Do not cut these buffers — they prevent technical debt and production incidents.

### What Stays
- PostgreSQL as the foundation (extended, not replaced)
- TypeScript across the entire stack
- React + Expo for web and mobile
- Clerk for authentication
- Stripe for billing
- pnpm monorepo structure

---

## 2. Current System Analysis

### 2.1 Current Stack Inventory

```
artifacts/
  api-server/        Express 5, Node.js 24, TypeScript ESM, port 8080
  foodoro/           React 19, Vite, Tailwind, Shadcn UI, port 24753
  foodoro-mobile/    Expo 54, React Native, Expo Router
lib/
  db/               Drizzle ORM + PostgreSQL schema
  api-spec/         OpenAPI 3.1 (single source of truth)
  api-zod/          Generated Zod schemas
  api-client-react/ Generated React Query hooks (Orval)
```

### 2.2 Codebase Size (Actual)

| Package | Lines of TypeScript | Components / Routes |
|---------|--------------------|--------------------|
| api-server | ~15,000 | 60+ endpoints |
| foodoro (web) | ~12,000 | 150+ React components |
| foodoro-mobile | ~8,000 | 20+ screens |
| lib/db | ~3,000 | 50+ DB tables |
| **Total** | **~38,000** | |

This is a non-trivial codebase. Every architectural change must be backward-compatible unless explicitly planned otherwise.

### 2.3 Current Database Tables
| Table | Purpose | Tenant-Scoped |
|-------|---------|---------------|
| tenants | Tenant registry + Stripe billing | No (root) |
| users | Staff members | Yes |
| categories | Menu categories | Yes |
| products | Menu items | Yes |
| orders | Sales transactions | Yes |
| order_items | Line items per order | Yes |
| kitchen_tickets | KDS tickets | Yes |
| inventory_items | Stock tracking | Yes |
| tables | Physical table layout | Yes |
| customers | Customer profiles | Yes |
| loyalty_programs | Rewards programs | Yes |
| suppliers | Supply chain | Yes |
| coupons | Discount codes | Yes |
| audit_logs | Activity tracking | Yes |
| webhooks | External integrations | Yes |

### 2.3 Current API Surface
- **Auth:** POST /auth/refresh, POST /auth/logout
- **Public:** GET /public/menu, POST /public/orders
- **Orders:** CRUD + complete
- **Kitchen:** GET tickets, PATCH status
- **Products/Categories:** Full CRUD
- **Inventory:** CRUD + adjust
- **Reports:** daily, hourly, top-products, dashboard, monthly, yearly, kpis
- **Tables/Floor:** CRUD
- **Customers/Loyalty:** GET + points
- **Billing:** portal, webhook
- **Tenants:** CRUD (platform admin)
- **AI:** generate-insights, demand-forecast (stub)
- **WebSocket:** /ws broker

### 2.4 Architectural Weaknesses

#### The 5 Critical Performance Bottlenecks (Immediate Impact)

**Bottleneck 1 — No Background Processing**
Every long operation (PDF generation, email sending, report calculation) runs synchronously inside the request handler. The user waits 3–8 seconds for operations that should be instant.
```
User clicks "Print Invoice"
  → Request waits for PDF generation (3–5 seconds)
  → Request waits for printer connection (2–3 seconds)
  → Total wait: 5–8 seconds → User abandons
```

**Bottleneck 2 — No Event-Driven Architecture**
When an order is created, the handler must simultaneously update inventory, notify the kitchen, add loyalty points, and write to analytics — all in one synchronous request. If any step fails, the entire order fails with it.

**Bottleneck 3 — Reports and POS Share the Same Database**
Heavy report queries (reading millions of rows) run on the same PostgreSQL instance that handles live orders. A monthly report can freeze the POS for seconds.

**Bottleneck 4 — No Caching Layer**
The product menu, prices, and tenant config are re-read from the database on every single request. A busy restaurant with 200 orders/hour reads the same menu data 200+ times.

**Bottleneck 5 — Single Point of Failure**
One API server process handles everything. A bug in the reports module can take down the POS. There is no isolation between critical and non-critical code paths.

#### Architectural Weaknesses (Structural)
1. **No Event Store** — No history of what happened. Replaying, auditing, or debugging past behavior is impossible.
2. **AI is Cosmetic** — Two AI endpoints exist as stubs with no vector DB, embedding pipeline, or training loop.
3. **No Offline Support** — Any connectivity interruption halts POS and Kitchen operations.
4. **No Workflow Engine** — Every automation requires a code deployment.
5. **No Observability Stack** — Pino logs exist but no distributed tracing or metrics aggregation.
6. **No background job queue** — Everything is synchronous HTTP.
7. **No per-tenant rate limiting** — Limits are global only.
8. **Inventory deduction is manual** — Not triggered automatically on order completion.

### 2.5 What Is Already Good
- Solid multi-tenant RLS foundation (PostgreSQL policies)
- Clean contract-first OpenAPI → Zod + React Query codegen pipeline
- Strong TypeScript discipline across the stack
- Clerk auth integration with tenant context
- Stripe billing with plan tiers
- Bilingual AR/EN + RTL-aware UI
- Drizzle ORM type safety
- RBAC middleware foundation

---

## 3. Target Architecture

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Web POS     │  │  Mobile App  │  │  Partner API / Webhooks  │  │
│  │  (React)     │  │  (Expo RN)   │  │  (3rd Party Integrations)│  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└─────────┼─────────────────┼──────────────────────-─┼────────────────┘
          │ WebSocket + REST │                        │ REST
┌─────────▼─────────────────▼────────────────────────▼────────────────┐
│                         API GATEWAY                                  │
│  Auth • Rate Limiting • Tenant Resolution • Request Routing          │
│  (Kong / custom Express gateway)                                     │
└─────────┬──────────────────────────────────────────────────────------┘
          │
┌─────────▼──────────────────────────────────────────────────────-----┐
│                    CORE DOMAIN SERVICES                              │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────┐ │
│  │ Orders  │ │ Kitchen │ │Inventory │ │  Products  │ │ Reports  │ │
│  │ Service │ │ Service │ │ Service  │ │  Service   │ │ Service  │ │
│  └────┬────┘ └────┬────┘ └────┬─────┘ └─────┬──────┘ └────┬─────┘ │
└───────┼───────────┼───────────┼──────────────┼─────────────┼───────┘
        │           │           │              │             │
┌───────▼───────────▼───────────▼──────────────▼─────────────▼───────┐
│                         EVENT BUS                                    │
│                   (BullMQ + Redis Streams)                           │
│  order:created • ticket:updated • inventory:adjusted • ...          │
└───────┬─────────────────────────────────────────────────────────────┘
        │
┌───────▼──────────────────────────────────────────────────────-------┐
│               PLATFORM INTELLIGENCE LAYER                            │
│  ┌────────────┐ ┌──────────────┐ ┌────────────┐ ┌───────────────┐  │
│  │  AI Core   │ │  Workflow    │ │  Agents    │ │  BI Engine    │  │
│  │  Service   │ │  Engine      │ │  Runtime   │ │  (Analytics)  │  │
│  └────────────┘ └──────────────┘ └────────────┘ └───────────────┘  │
└──────────────────────────────────────────────────────────-----------┘
        │
┌───────▼──────────────────────────────────────────────────────-------┐
│                         DATA LAYER                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │
│  │  PostgreSQL  │ │  Redis       │ │  pgvector    │ │  S3 / R2  │  │
│  │  (Write DB)  │ │  (Cache+Bus) │ │  (Vector DB) │ │  (Assets) │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └───────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Flow (Event-Driven)

```
POS Client
    │
    │ POST /orders (Command)
    ▼
Orders Command Handler
    │
    ├── Validate (Zod schema)
    ├── Write to orders table (PostgreSQL)
    ├── Emit → order:created (Event Bus)
    │
    │   ┌─────────────────────────────────────────┐
    │   │  Event Consumers (async, decoupled)      │
    │   │                                          │
    │   ├── KitchenService: create ticket          │
    │   ├── InventoryService: deduct stock         │
    │   ├── LoyaltyService: add points             │
    │   ├── AIService: update demand model         │
    │   ├── NotificationService: push to staff     │
    │   ├── AuditService: write audit log          │
    │   └── AnalyticsService: update projections   │
    │   └─────────────────────────────────────────┘
    │
    ▼
Response → Client (immediate, 200 OK)
```

---

## 4. Architectural Transformation Strategy

### 4.1 The Three Principles

1. **Strangler Fig Pattern** — Never rewrite; wrap old behavior with new infrastructure, migrate gradually.
2. **Event-First** — Every state change that matters to more than one service must emit a domain event.
3. **Read-Write Separation** — Write paths optimize for consistency; read paths optimize for speed.

### 4.2 Migration Phases at a Glance

| Phase | Name | Duration | Risk |
|-------|------|----------|------|
| -1 | Pre-work & Team Prep | **2 weeks** | Low |
| 0 | Foundation | **10 weeks** | Low |
| 1 | Event Bus + CQRS Spine | **11 weeks** | Medium |
| 2 | Real-time + Offline | **12 weeks** | Medium |
| 3 | AI Core | **14 weeks** | High |
| 4 | Workflow Engine | **12 weeks** | Medium |
| 5 | Autonomous Agents | **16 weeks** | High |
| 6 | Platform + Marketplace | **16 weeks** | Medium |

**Total: 93 weeks (~22 months)** with a team growing from 5 to 11 engineers.

> Why not 16 months? Each phase includes: 2 weeks integration testing with real data, 1 week migration tooling, 1 week documentation and team training, plus inherent buffer for bugs discovered during real-world testing. These are not optional — skipping them creates technical debt that costs 3× as long to fix later.

---

## 5. Services Breakdown

### 5.1 Core Domain Services

Each service owns its own:
- Database schema partition (Postgres schema or separate DB)
- Event contracts (published and consumed)
- OpenAPI spec section
- Deployment unit

| Service | Responsibility | Events Published | Events Consumed |
|---------|---------------|-----------------|-----------------|
| **orders-service** | POS transactions, order lifecycle | order:created, order:updated, order:completed, order:cancelled | inventory:insufficient |
| **kitchen-service** | KDS tickets, preparation tracking | ticket:created, ticket:status:changed, ticket:completed | order:created |
| **inventory-service** | Stock levels, thresholds, suppliers | inventory:adjusted, inventory:low, inventory:depleted | order:completed |
| **products-service** | Menu items, categories, pricing | product:created, product:updated, product:deactivated | — |
| **customers-service** | Profiles, loyalty, segments | customer:created, customer:points:earned | order:completed |
| **reports-service** | Read projections, BI queries | — | All domain events |
| **notifications-service** | Push, email, SMS, in-app alerts | notification:sent | Any event with notification rule |
| **billing-service** | Stripe subscriptions, plan gates | subscription:activated, subscription:expired | — |
| **tenants-service** | Tenant CRUD, onboarding | tenant:created, tenant:suspended | — |
| **users-service** | Staff management, RBAC | user:created, user:role:changed | — |
| **ai-service** | Inference, embeddings, insights | insight:generated, forecast:ready | All domain events |
| **workflow-engine** | Trigger/condition/action runtime | workflow:triggered, workflow:completed | All domain events |
| **agents-runtime** | Autonomous agent execution | agent:action:taken | All domain events |
| **sync-service** | Offline sync arbitration | sync:conflict, sync:resolved | — |

### 5.2 Platform Services

| Service | Responsibility |
|---------|---------------|
| **api-gateway** | Auth, routing, rate limiting, tenant resolution |
| **event-store** | Immutable event log (append-only) |
| **media-service** | Image uploads, S3/R2, CDN |
| **audit-service** | Compliance log, tamper-evident records |
| **config-service** | Feature flags, tenant config, remote settings |
| **scheduler-service** | Cron jobs, delayed events, reminders |

### 5.3 Service Communication Matrix

```
Synchronous (REST/gRPC) — for Commands that need immediate response:
  Client → API Gateway → Domain Service

Asynchronous (Event Bus) — for Events that notify other services:
  Domain Service → Event Bus → N consumers

Direct DB Query — never across service boundaries:
  Each service reads ONLY its own schema partition
```

---

## 6. Event Bus Architecture

### 6.1 Technology Choice: BullMQ + Redis Streams

**Why not Kafka?**
- Kafka requires dedicated Zookeeper/KRaft clusters, minimum 3 brokers, ~$300–500/month in infrastructure.
- For a growing SaaS platform with < 10,000 tenants, Kafka is over-engineered.
- BullMQ on Redis Streams provides 99% of the value with 10% of the operational cost.
- Upgrade path to Kafka exists when volume exceeds 50M events/day.

**Why not RabbitMQ?**
- RabbitMQ lacks native event streaming replay (messages are consumed once).
- Redis Streams support consumer groups, replay from offset, and persistence — matching Kafka's core guarantees at smaller scale.

### 6.2 Event Bus Design

```
┌─────────────────────────────────────────────────────┐
│                 Redis Streams                        │
│                                                      │
│  Stream: foodoro:events:{tenantId}                   │
│  ┌─────────────────────────────────────────────┐    │
│  │  Entry: {                                    │    │
│  │    id: "1715000000000-0"   (auto XADD)       │    │
│  │    type: "order:created"                     │    │
│  │    aggregateId: "order_abc123"               │    │
│  │    aggregateType: "Order"                    │    │
│  │    tenantId: "tenant_xyz"                    │    │
│  │    payload: { ... }                          │    │
│  │    metadata: {                               │    │
│  │      causationId: "req_xxx"                  │    │
│  │      correlationId: "session_yyy"            │    │
│  │      userId: "user_zzz"                      │    │
│  │      timestamp: 1715000000000                │    │
│  │      version: 1                              │    │
│  │    }                                         │    │
│  │  }                                           │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
         │
         ├── Consumer Group: kitchen-service
         ├── Consumer Group: inventory-service
         ├── Consumer Group: analytics-service
         ├── Consumer Group: ai-service
         ├── Consumer Group: notification-service
         └── Consumer Group: audit-service
```

### 6.3 Event Schema (TypeScript Contract)

```typescript
interface DomainEvent<T = unknown> {
  id: string;                    // ULID
  type: EventType;               // "order:created" etc.
  aggregateId: string;           // "order_abc123"
  aggregateType: AggregateType;  // "Order"
  tenantId: string;
  payload: T;
  metadata: {
    causationId: string;         // ID of command that caused this
    correlationId: string;       // Trace across services
    userId: string | null;
    timestamp: number;           // Unix ms
    version: number;             // Schema version for forward compat
  };
}
```

### 6.4 Event Catalog

| Event | Aggregate | Payload |
|-------|-----------|---------|
| `order:created` | Order | { orderId, items[], tableId, total, customerId? } |
| `order:updated` | Order | { orderId, changes } |
| `order:completed` | Order | { orderId, completedAt, totalPaid } |
| `order:cancelled` | Order | { orderId, reason, cancelledBy } |
| `ticket:created` | KitchenTicket | { ticketId, orderId, items[] } |
| `ticket:status:changed` | KitchenTicket | { ticketId, from, to, changedBy } |
| `inventory:adjusted` | InventoryItem | { itemId, delta, reason, newLevel } |
| `inventory:low` | InventoryItem | { itemId, currentLevel, threshold } |
| `inventory:depleted` | InventoryItem | { itemId } |
| `product:created` | Product | { productId, name, price, categoryId } |
| `product:deactivated` | Product | { productId } |
| `customer:created` | Customer | { customerId, name, email } |
| `customer:points:earned` | Customer | { customerId, points, orderId } |
| `workflow:triggered` | Workflow | { workflowId, triggerId, context } |
| `agent:action:taken` | Agent | { agentId, action, result } |
| `tenant:created` | Tenant | { tenantId, name, plan } |
| `subscription:activated` | Subscription | { tenantId, plan, expiresAt } |

### 6.5 Dead Letter Queue Strategy

```
Primary Queue → [3 retry attempts, exponential backoff]
              → On 3rd failure → Dead Letter Queue (DLQ)
              → DLQ → Alert to engineering Slack channel
              → DLQ entries preserved for 30 days
              → Manual replay tool available
```

---

## 7. CQRS Strategy

### 7.1 CQRS Overview

```
WRITE SIDE (Commands)              READ SIDE (Queries)
─────────────────────              ──────────────────
Command → Handler                  Query → Read Model
    │                                  │
    ├── Validate                       ├── Pre-computed projections
    ├── Apply business rules           ├── Denormalized for speed
    ├── Persist to write DB            ├── Updated by event consumers
    └── Emit domain event              └── Can use different DB engine
```

### 7.2 Command Types

Commands are named intentions. They may be rejected. They always produce 0 or 1 events.

```typescript
// Example Command
interface CreateOrderCommand {
  type: "CreateOrder";
  tenantId: string;
  userId: string;
  tableId: string | null;
  items: Array<{ productId: string; quantity: number; notes?: string }>;
  customerId?: string;
  couponCode?: string;
}

// Handler returns either Success (with event) or Failure (with error)
type CommandResult<E> =
  | { success: true; event: E }
  | { success: false; error: string; code: string };
```

### 7.3 Read Models (Projections)

Each read model is rebuilt from the event stream. They can be rebuilt at any time.

| Read Model | Purpose | Storage | Update Trigger |
|------------|---------|---------|----------------|
| `orders_projection` | Order list + detail | PostgreSQL (materialized view) | order:* events |
| `kitchen_board` | Current KDS state | Redis hash | ticket:* events |
| `inventory_summary` | Stock levels + alerts | PostgreSQL | inventory:* events |
| `dashboard_kpis` | Revenue, orders, avg | Redis + PostgreSQL | order:completed |
| `customer_profiles` | Enriched customer view | PostgreSQL | customer:* + order:* |
| `product_analytics` | Sales per product | PostgreSQL | order:completed |
| `ai_feature_store` | ML-ready features | PostgreSQL + pgvector | All events |

### 7.4 CQRS Implementation Structure

```
lib/cqrs/
  src/
    commands/
      command-bus.ts         # Routes commands to handlers
      command-handler.ts     # Base handler interface
      command-validator.ts   # Zod validation layer
    queries/
      query-bus.ts           # Routes queries to read models
      query-handler.ts       # Base query handler
    projections/
      projection-runner.ts   # Rebuilds projections from event store
      projection-registry.ts # All registered projections
    events/
      event-bus.ts           # Publish/subscribe
      event-store.ts         # Append-only persistence
```

---

## 8. Event Sourcing Strategy

### 8.1 What Gets Event-Sourced

Not everything needs full event sourcing. We apply it selectively to aggregates where history matters:

| Aggregate | Event-Sourced? | Reason |
|-----------|---------------|--------|
| Order | Yes | Full audit trail required |
| KitchenTicket | Yes | Preparation history |
| InventoryItem | Yes | Every stock movement auditable |
| Customer | Yes | Full interaction history for AI |
| Workflow | Yes | Execution replay for debugging |
| Product | No | CRUD is sufficient |
| User | No | Auth system handles this |
| Tenant | No | CRUD is sufficient |

### 8.2 Event Store Schema

```sql
CREATE TABLE event_store (
  id           BIGSERIAL PRIMARY KEY,
  event_id     UUID NOT NULL UNIQUE,           -- ULID
  stream_id    TEXT NOT NULL,                  -- "Order-{id}"
  event_type   TEXT NOT NULL,                  -- "order:created"
  aggregate_id TEXT NOT NULL,
  tenant_id    UUID NOT NULL,
  payload      JSONB NOT NULL,
  metadata     JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version      INT NOT NULL                    -- optimistic concurrency
);

CREATE INDEX idx_event_store_stream ON event_store(stream_id, version);
CREATE INDEX idx_event_store_tenant ON event_store(tenant_id, created_at);
CREATE INDEX idx_event_store_type   ON event_store(event_type, tenant_id);
```

### 8.3 Aggregate Reconstruction

```typescript
// Reconstruct current state from event history
async function reconstructOrder(orderId: string): Promise<Order> {
  const events = await eventStore.getStream(`Order-${orderId}`);
  return events.reduce(applyOrderEvent, initialOrderState());
}
```

### 8.4 Snapshot Strategy

For high-frequency aggregates, snapshots prevent full replay on every read:

```
Every 50 events → write snapshot to snapshots table
On reconstruct  → load latest snapshot + events after snapshot
```

```sql
CREATE TABLE aggregate_snapshots (
  aggregate_id   TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  tenant_id      UUID NOT NULL,
  version        INT NOT NULL,
  state          JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (aggregate_id, version)
);
```

### 8.5 Phase 0 Additional Tables

```sql
-- Background Job Persistence (BullMQ uses Redis; this is DB-side audit)
CREATE TABLE job_logs (
  id             BIGSERIAL PRIMARY KEY,
  job_id         TEXT NOT NULL UNIQUE,
  job_type       TEXT NOT NULL,          -- "send_email", "generate_pdf", "sync_inventory"
  tenant_id      UUID NOT NULL,
  status         TEXT NOT NULL,          -- pending|processing|completed|failed
  payload        JSONB NOT NULL,
  result         JSONB,
  error_message  TEXT,
  attempts       INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX idx_job_logs_tenant ON job_logs(tenant_id, created_at DESC);
CREATE INDEX idx_job_logs_status ON job_logs(status, job_type);

-- Audit Log (written by event consumers — not by request handlers)
CREATE TABLE audit_log (
  id             BIGSERIAL PRIMARY KEY,
  event_id       TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  entity_id      TEXT NOT NULL,
  action         TEXT NOT NULL,
  user_id        UUID,
  changes        JSONB,                  -- {before, after}
  ip_address     INET,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  tenant_id      UUID NOT NULL
);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_user   ON audit_log(user_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
```

### 8.6 Phase 1 Projection Tables

```sql
-- Orders Read Model (fast reads without touching write table)
CREATE TABLE orders_projection (
  id             TEXT PRIMARY KEY,
  tenant_id      UUID NOT NULL,
  order_number   INT NOT NULL,
  customer_id    TEXT,
  total_amount   DECIMAL(10, 2) NOT NULL,
  status         TEXT NOT NULL,          -- pending|preparing|ready|completed|cancelled
  table_id       TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  completed_at   TIMESTAMPTZ,
  items_count    INT NOT NULL,
  items_json     JSONB,                  -- [{productId, qty, price, name}]
  notes          TEXT,
  last_updated   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_proj_tenant ON orders_projection(tenant_id, created_at DESC);
CREATE INDEX idx_orders_proj_status ON orders_projection(tenant_id, status);

-- Kitchen Board State (current KDS view — rebuilt from events)
CREATE TABLE kitchen_board_state (
  id                  TEXT PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  order_id            TEXT NOT NULL,
  ticket_number       INT NOT NULL,
  status              TEXT NOT NULL,     -- new|preparing|ready|served
  items_json          JSONB,
  created_at          TIMESTAMPTZ NOT NULL,
  last_status_change  TIMESTAMPTZ,
  time_preparing_secs INT,
  priority            INT DEFAULT 0      -- higher = more urgent
);
CREATE INDEX idx_kitchen_tenant_status ON kitchen_board_state(tenant_id, status);

-- Inventory Summary (current stock state — rebuilt from events)
CREATE TABLE inventory_summary (
  id                  TEXT PRIMARY KEY,
  tenant_id           UUID NOT NULL,
  product_id          TEXT NOT NULL,
  current_quantity    DECIMAL(10, 2) NOT NULL,
  reserved_quantity   DECIMAL(10, 2) DEFAULT 0,
  available_quantity  DECIMAL(10, 2) NOT NULL,
  minimum_threshold   DECIMAL(10, 2),
  reorder_quantity    DECIMAL(10, 2),
  last_adjusted       TIMESTAMPTZ DEFAULT NOW(),
  last_counted        TIMESTAMPTZ,
  needs_reorder       BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_inventory_summary_tenant ON inventory_summary(tenant_id, product_id);
CREATE INDEX idx_inventory_needs_reorder  ON inventory_summary(tenant_id) WHERE needs_reorder = TRUE;
```

### 8.7 Phase 2 Sync Tables

```sql
-- Sync Metadata (per-tenant sync clock)
CREATE TABLE sync_metadata (
  tenant_id          UUID PRIMARY KEY,
  last_sync_at       TIMESTAMPTZ NOT NULL,
  last_pull_event_id TEXT,
  client_count       INT DEFAULT 0,
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Sync Conflicts (recorded for debugging and manual review)
CREATE TABLE sync_conflicts (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       UUID NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  client_version  JSONB NOT NULL,
  server_version  JSONB NOT NULL,
  resolution      TEXT NOT NULL,         -- "client_wins" | "server_wins" | "merged"
  resolved_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sync_conflicts_tenant ON sync_conflicts(tenant_id, resolved_at DESC);
```

---

## 9. AI Infrastructure Architecture

### 9.1 AI Architecture Overview

```
┌────────────────────────────────────────────────────────────┐
│                      AI CORE                                │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  AI Gateway  │  │  Embedding   │  │  Feature Store  │  │
│  │  (Routing)   │  │  Pipeline    │  │  (pgvector)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         │                 │                   │           │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────▼────────┐  │
│  │  LLM Models  │  │  Vector DB   │  │  ML Models      │  │
│  │  (OpenAI /   │  │  (pgvector + │  │  (Forecasting,  │  │
│  │  Anthropic / │  │  Pinecone)   │  │  Classification)│  │
│  │  local)      │  └──────────────┘  └─────────────────┘  │
│  └──────────────┘                                         │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            AI MEMORY LAYER                           │  │
│  │  Short-term: Redis (session context, 24h TTL)        │  │
│  │  Long-term:  PostgreSQL (entity memory, permanent)   │  │
│  │  Semantic:   pgvector (similarity search)            │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 9.2 AI Capabilities by Phase

| Capability | Phase | Model | Data Source |
|------------|-------|-------|-------------|
| Demand Forecasting | 3 | Time-series ML (Prophet/custom) | order history |
| Menu Recommendations | 3 | Collaborative filtering | order items |
| Inventory Optimization | 3 | Regression + threshold | inventory + sales |
| Customer Segmentation | 3 | K-means clustering | customer profiles |
| Natural Language Insights | 3 | OpenAI GPT-4o | aggregated events |
| Anomaly Detection | 4 | Isolation Forest | real-time metrics |
| Price Optimization | 5 | Reinforcement Learning | sales + elasticity |
| Churn Prediction | 5 | XGBoost classification | customer behavior |

### 9.3 AI Gateway

The AI Gateway abstracts model selection, cost management, and fallback:

```typescript
interface AIGatewayRequest {
  capability: "forecast" | "insight" | "recommendation" | "anomaly";
  context: {
    tenantId: string;
    plan: SubscriptionPlan;    // Controls model quality
    data: unknown;
  };
  priority: "realtime" | "batch";
}

// Model routing by plan:
// starter → local lightweight models or cached results
// pro     → OpenAI GPT-4o-mini, basic ML models
// enterprise → GPT-4o, full ML suite, dedicated embeddings
```

### 9.4 Embedding Pipeline

```
Domain Events → [nightly batch + real-time trigger]
              → Embedding Worker
              → OpenAI text-embedding-3-small (1536 dimensions)
              → pgvector table: entity_embeddings
              → Available for semantic search, recommendations, similarity
```

### 9.5 Feature Store Schema

```sql
-- Pre-computed ML features, refreshed by event consumers
CREATE TABLE ai_feature_store (
  tenant_id        UUID NOT NULL,
  entity_type      TEXT NOT NULL,    -- 'product', 'customer', 'hour_of_day'
  entity_id        TEXT NOT NULL,
  feature_name     TEXT NOT NULL,
  feature_value    DOUBLE PRECISION,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, entity_type, entity_id, feature_name)
);

-- Vector embeddings for semantic search
CREATE TABLE entity_embeddings (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        UUID NOT NULL,
  entity_type      TEXT NOT NULL,
  entity_id        TEXT NOT NULL,
  embedding        vector(1536),    -- pgvector
  text_content     TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON entity_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### 9.6 AI Learning Loop

```
Business Event occurs
    │
    ▼
Feature Extractor (event consumer)
    │ → updates ai_feature_store
    ▼
Model Retraining Trigger (weekly batch or on significant drift)
    │
    ▼
Model Evaluation (A/B test against previous version)
    │
    ▼
Model Promotion (if metrics improve) → serving
    │
    ▼
Outcome tracking (was the recommendation followed? did it work?)
    │
    ▼
Feedback loop → next training cycle
```

---

## 10. Workflow Engine Architecture

### 10.1 Concept

An internal Zapier/n8n-like engine. Tenants define automations without code:

```
TRIGGER: When [event occurs] AND [conditions are true]
→ ACTIONS: Do [action 1] then [action 2] then [action 3]
→ APPROVALS: Require sign-off from [role] before [action]
→ SCHEDULE: Retry [N times] on failure
```

### 10.2 Workflow Data Model

```sql
CREATE TABLE workflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  description   TEXT,
  enabled       BOOLEAN NOT NULL DEFAULT true,
  trigger       JSONB NOT NULL,    -- WorkflowTrigger
  conditions    JSONB NOT NULL,    -- WorkflowCondition[]
  actions       JSONB NOT NULL,    -- WorkflowAction[]
  created_by    UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workflow_executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES workflows(id),
  tenant_id     UUID NOT NULL,
  status        TEXT NOT NULL,     -- pending|running|completed|failed|awaiting_approval
  trigger_event JSONB NOT NULL,
  context       JSONB NOT NULL,    -- execution context variables
  steps_log     JSONB[] NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT
);
```

### 10.3 Trigger Types

| Trigger | Event | Example |
|---------|-------|---------|
| `event:order:created` | New order placed | Send WhatsApp to kitchen manager |
| `event:inventory:low` | Stock below threshold | Auto-create purchase order |
| `event:customer:returning` | Customer visits N times | Issue loyalty reward |
| `schedule:daily:09:00` | Time-based | Send daily sales summary |
| `manual` | Staff-initiated | Trigger end-of-day reconciliation |
| `webhook:inbound` | External trigger | POS hardware event |

### 10.4 Action Library

| Action | Description |
|--------|-------------|
| `send:notification` | Push / email / SMS / in-app |
| `create:order` | Programmatic order creation |
| `adjust:inventory` | Stock adjustment |
| `create:task` | Assign a task to a staff member |
| `call:webhook` | Call external URL |
| `call:ai` | Invoke AI capability |
| `wait:approval` | Pause until approved by role |
| `delay` | Wait N minutes/hours |
| `condition:branch` | If/else branching |
| `update:record` | Update any entity field |

### 10.5 Visual Builder (Frontend)

React Flow-based drag-and-drop canvas:
```
[Trigger Block] → [Condition Block] → [Action Block] → [Action Block]
                         ↓ (false branch)
                  [Alternative Action]
```

---

## 11. Real-time Architecture

### 11.1 WebSocket Upgrade Strategy

Current SSE will be maintained for read-only broadcasts. WebSocket layer will be added for bidirectional communication.

```
┌────────────────────────────────────────────────────────────┐
│                    REAL-TIME LAYER                          │
│                                                            │
│  SSE (keep):  Server → Client broadcasts                   │
│    - Order status updates to Kitchen                       │
│    - Inventory alerts                                      │
│    - Dashboard metric updates                              │
│                                                            │
│  WebSocket (add):  Bidirectional                           │
│    - Live POS collaboration (multiple cashiers)            │
│    - Kitchen acknowledgment signals                        │
│    - Presence (who is online in this tenant)               │
│    - Real-time typing / editing indicators                 │
│    - Live inventory editing (prevent conflicts)            │
└────────────────────────────────────────────────────────────┘
```

### 11.2 Presence System

```typescript
interface PresenceState {
  userId: string;
  tenantId: string;
  role: string;
  currentPage: string;           // "/kitchen", "/pos", etc.
  lastActivity: number;          // unix timestamp
  metadata: {
    displayName: string;
    avatar?: string;
    activeOrderId?: string;      // what they are currently working on
  };
}

// Redis key: presence:{tenantId}:{userId}
// TTL: 30 seconds, refreshed by heartbeat every 15s
// Broadcast: XADD presence:changes → all clients in tenant
```

### 11.3 WebSocket Message Protocol

```typescript
// Client → Server
type ClientMessage =
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "heartbeat" }
  | { type: "action"; payload: CommandPayload };

// Server → Client
type ServerMessage =
  | { type: "event"; channel: string; data: DomainEvent }
  | { type: "presence"; users: PresenceState[] }
  | { type: "ack"; commandId: string; result: "ok" | "error" }
  | { type: "error"; code: string; message: string };
```

### 11.4 Channel Subscription Model

```
tenant:{tenantId}                  All events for this tenant
tenant:{tenantId}:kitchen          Kitchen events only
tenant:{tenantId}:pos              POS events only
tenant:{tenantId}:inventory        Inventory events only
tenant:{tenantId}:presence         User presence updates
user:{userId}                      Personal notifications
```

---

## 12. Offline-First Architecture

### 12.1 Local-First Manifesto

The POS, Kitchen, and Inventory **must function 100% without internet**. Internet connectivity is an enhancement, not a requirement.

### 12.2 Technology Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Local DB (mobile) | SQLite via expo-sqlite | Native, fast, no dependencies |
| Local DB (web) | IndexedDB via Dexie.js | Browser-native, large capacity |
| Sync Protocol | Custom CRDT-inspired | Conflict-free merges |
| Background Sync | Service Worker + BullMQ | Reliable retry on reconnect |
| Conflict Resolution | Last-Write-Wins with vector clocks | Predictable for POS use cases |

### 12.3 Offline-Capable Features

| Feature | Offline Behavior |
|---------|-----------------|
| Place Order | Stored locally → synced when online |
| Update Ticket Status | Local state → merged on sync |
| Adjust Inventory | Local delta recorded → applied on sync |
| View Menu | Served from local cache |
| View Orders History | Served from local snapshot |
| Generate Receipt | Local PDF generation |
| Customer Lookup | Local customer cache |

### 12.4 Local Database Schema (Web POS via Dexie.js)

```typescript
class FoodoroDB extends Dexie {
  orders!: Table<LocalOrder>;
  products!: Table<LocalProduct>;
  customers!: Table<LocalCustomer>;
  pendingSync!: Table<PendingSyncEntry>;

  constructor() {
    super("foodoro-offline");
    this.version(1).stores({
      orders:      "++localId, serverId, tenantId, status, createdAt",
      products:    "serverId, tenantId, categoryId, active",
      customers:   "serverId, tenantId, phone",
      pendingSync: "++id, entityType, entityId, operation, syncedAt",
    });
  }
}
```

### 12.5 Sync Queue

```
Every create/update/delete in offline mode → append to pendingSync table

On reconnect:
  1. Pull latest server state (GET /sync/pull?since={lastSyncAt})
  2. Apply server changes to local DB (server wins for non-conflicting)
  3. Push pending local changes (POST /sync/push)
  4. Server arbitrates conflicts using vector clock comparison
  5. Clear synced entries from pendingSync
```

---

## 13. Sync Engine Architecture

### 13.1 Sync Protocol

```
Client → POST /api/sync/push
  body: {
    clientId: string;
    lastSyncAt: number;
    changes: SyncChange[];  // All mutations since lastSyncAt
  }

Server response: {
  accepted: string[];       // Change IDs accepted
  rejected: ConflictEntry[]; // Changes rejected with reason + server state
  serverChanges: SyncChange[]; // Changes from server since client's lastSyncAt
  newSyncAt: number;
}
```

### 13.2 Conflict Resolution Rules

| Entity | Conflict Rule | Reason |
|--------|--------------|--------|
| Order | Server wins (immutable after creation) | Prevent duplicate orders |
| Order status | Highest state wins (created→preparing→ready→done) | Can't go backward |
| Inventory | Delta merge (additive) | Both changes valid, sum them |
| Product price | Last server timestamp wins | Server is source of truth |
| Ticket status | Highest state wins | Same as order |
| Customer profile | Client wins for contact info | Staff update is intentional |

### 13.3 Vector Clock Implementation

```typescript
interface VectorClock {
  [nodeId: string]: number;  // nodeId = clientId or "server"
}

function compareClocks(a: VectorClock, b: VectorClock): "before" | "after" | "concurrent" {
  // Returns ordering or "concurrent" (conflict) when clocks diverged
}
```

---

## 14. AI Agents Architecture

### 14.1 Agent Runtime Overview

Agents are autonomous processes that:
1. **Observe** — subscribe to event streams and read model projections
2. **Analyze** — apply rules and ML models to current state
3. **Decide** — determine if action is needed
4. **Act** — emit commands or trigger workflows (with optional human approval gate)
5. **Learn** — record outcomes to improve future decisions

### 14.2 Agent Types

#### Inventory Agent
```
Observes: inventory:adjusted, inventory:low, order:completed
Analyzes: consumption rate, lead time, seasonal patterns
Acts on:
  - Low stock → trigger reorder workflow
  - Anomaly in usage → alert manager
  - Predictive: suggest order quantities for next week
Approval required: Purchase orders > SAR 5,000
```

#### Demand Forecast Agent
```
Observes: order:created, time-of-day patterns, calendar data
Analyzes: time-series demand model per product per hour
Acts on:
  - Pre-shift: suggest prep quantities to kitchen
  - Weekly: generate forecast report
  - Events (Ramadan, holidays): adjust recommendations automatically
```

#### Finance Agent
```
Observes: order:completed, inventory:adjusted, payroll events
Analyzes: revenue vs. cost, margins per product, cash flow
Acts on:
  - Daily P&L summary to owner
  - Margin alerts on products below threshold
  - End-of-month financial summary
```

#### Marketing Agent
```
Observes: customer:created, customer:churning, loyalty events
Analyzes: customer segments, RFM scoring, lifetime value
Acts on:
  - Identify at-risk customers → trigger retention workflow
  - Identify top customers → trigger VIP reward
  - Suggest menu promotions based on slow-moving items
```

#### Operations Agent
```
Observes: ticket:status:changed, table:occupied, staff:clocked-in
Analyzes: table turnover rate, ticket preparation time, staff efficiency
Acts on:
  - Alert manager when tickets exceed SLA
  - Suggest optimal table assignments
  - Flag understaffing situations
```

### 14.3 Agent Runtime Infrastructure

```typescript
interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  subscribes: EventType[];         // Events to listen to
  schedule?: string;               // Cron for scheduled analysis
  requiredPlan: SubscriptionPlan;  // Plan gate
  run: (context: AgentContext) => Promise<AgentAction[]>;
}

interface AgentContext {
  event?: DomainEvent;             // Triggering event (if event-based)
  db: DrizzleInstance;             // Read model access
  ai: AIGateway;                   // AI capabilities
  emit: (command: Command) => Promise<void>; // Execute actions
  log: Logger;
}

interface AgentAction {
  type: "command" | "notification" | "workflow:trigger" | "await:approval";
  payload: unknown;
  requiresApproval?: {
    role: string;
    reason: string;
    timeout: number;               // ms before auto-reject
  };
}
```

### 14.4 Human-in-the-Loop Pattern

```
Agent decides → action.requiresApproval = true
     │
     ▼
Approval Request stored in DB
     │
     ├── Notification sent to [role] (push + in-app)
     │
     ▼
Timer starts (e.g. 30 minutes)
     │
     ├── Approved → action executed
     ├── Rejected → action cancelled, agent learns
     └── Timeout → escalate to next role or auto-reject
```

---

## 15. Database Scaling Strategy

### 15.1 Current State → Target State

```
Phase 0 (now):
  Single PostgreSQL instance
  All tables in one database
  Basic RLS for tenant isolation

Phase 1 (6 months):
  Read replica for reports and AI queries
  Connection pooling via PgBouncer
  Materialized views for dashboard projections

Phase 2 (12 months):
  Separate event_store database (append-only, massive write volume)
  Redis cluster for caching + session + event bus
  pgvector extension for AI embeddings

Phase 3 (18 months):
  Per-tenant database schemas (full schema isolation for Enterprise tier)
  Logical replication for read replicas per region
  TimescaleDB for metrics and time-series data

Phase 4 (24+ months):
  Horizontal sharding by tenant_id ranges
  Citus extension or manual shard routing
  Multi-region primary with regional replicas
```

### 15.2 Indexing Strategy

```sql
-- Tenant + time range (most common query pattern)
CREATE INDEX CONCURRENTLY idx_orders_tenant_time
  ON orders(tenant_id, created_at DESC);

-- Full-text search
CREATE INDEX CONCURRENTLY idx_products_search
  ON products USING gin(to_tsvector('simple', name || ' ' || coalesce(name_ar, '')));

-- Event store optimization
CREATE INDEX CONCURRENTLY idx_event_store_stream_version
  ON event_store(stream_id, version);

-- AI feature lookups
CREATE INDEX CONCURRENTLY idx_feature_store_entity
  ON ai_feature_store(tenant_id, entity_type, entity_id);
```

### 15.3 Caching Strategy

```
Layer 1 — Redis (hot data, <100ms):
  - Current menu by tenant (TTL: 5 minutes)
  - Dashboard KPIs (TTL: 60 seconds)
  - Kitchen board state (no TTL, event-invalidated)
  - Session / auth tokens (TTL: 24 hours)
  - Presence data (TTL: 30 seconds)

Layer 2 — PostgreSQL materialized views (warm data):
  - Daily/weekly/monthly report aggregates
  - Customer RFM scores
  - Product performance rankings
  (Refreshed every 15 minutes or on-demand)

Layer 3 — CDN (static assets):
  - Product images
  - Receipt templates
  - Menu PDFs
```

---

## 16. Multi-Tenant Strategy

### 16.1 Isolation Tiers

| Tier | Plan | Isolation Level | DB Approach |
|------|------|----------------|-------------|
| Shared | Starter | Row-Level Security (RLS) | Shared schema, tenant_id column |
| Shared+ | Pro | RLS + dedicated cache namespace | Shared schema, dedicated Redis prefix |
| Isolated | Enterprise | Schema isolation | Separate PostgreSQL schema per tenant |
| Dedicated | Enterprise+ | Full DB isolation | Separate PostgreSQL instance |

### 16.2 Tenant Onboarding Flow

```
1. Tenant registers (POST /api/tenants)
2. Platform creates:
   - tenants record
   - default admin user
   - default categories (Arabic + English)
   - default inventory thresholds
   - default workflow templates
   - Stripe customer record
3. Stripe → starter plan activated
4. Tenant admin invited via Clerk email
5. Onboarding wizard guides setup
```

### 16.3 Tenant Configuration

```typescript
interface TenantConfig {
  branding: {
    name: string;
    logo?: string;
    primaryColor: string;
    currency: string;    // "SAR", "AED", "USD"
    locale: "ar" | "en" | "both";
    taxRate: number;
  };
  features: {
    loyaltyEnabled: boolean;
    kitchenDisplayEnabled: boolean;
    onlineOrderingEnabled: boolean;
    qrOrderingEnabled: boolean;
    inventoryTrackingEnabled: boolean;
  };
  ai: {
    forecastingEnabled: boolean;
    agentsEnabled: boolean;
    recommendationsEnabled: boolean;
  };
  limits: {  // Enforced by requirePlan middleware
    maxProducts: number;
    maxUsers: number;
    maxBranches: number;
    maxWorkflows: number;
  };
}
```

---

## 17. Security Architecture

### 17.1 Defense in Depth

```
Layer 1 — Network
  - TLS 1.3 everywhere (Replit handles cert management)
  - No direct port exposure (all traffic via API Gateway)
  - DDoS protection at edge

Layer 2 — Authentication
  - Clerk: OAuth2 (Google) + Email/Password
  - JWT tokens with 24h expiry
  - Refresh token rotation (Redis-backed, planned Phase 1)
  - Device fingerprinting for suspicious login detection

Layer 3 — Authorization
  - RBAC: platform_admin > owner > admin > manager > cashier > kitchen
  - requireTenant middleware enforces tenant context on every request
  - requirePlan middleware gates features by subscription
  - PostgreSQL RLS as last line of tenant isolation

Layer 4 — Input Validation
  - Zod schemas on all request bodies (generated from OpenAPI)
  - Parameterized queries everywhere (Drizzle ORM)
  - No raw SQL string construction

Layer 5 — Output Security
  - Helmet.js: CSP, HSTS, X-Frame-Options headers
  - Response field filtering (never expose internal IDs of other tenants)
  - Rate limiting: 300 req/min per tenant (not global)

Layer 6 — Data Security
  - PII fields encrypted at rest (customer phone, email)
  - Stripe: no card data ever touches our servers (redirect to Stripe Checkout)
  - Audit log: every mutation recorded with user + IP + timestamp
  - Backup encryption: AES-256
```

### 17.2 Secret Management

```
All secrets in Replit environment variables (never in code)
  - DATABASE_URL
  - REDIS_URL
  - CLERK_SECRET_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - OPENAI_API_KEY
  - JWT_SECRET

Rotation policy:
  - JWT_SECRET: rotate every 90 days
  - STRIPE_WEBHOOK_SECRET: rotate on security events
  - API keys: rotate every 180 days
```

### 17.3 Webhook Security

All inbound webhooks require:
1. Signature verification (HMAC-SHA256)
2. Timestamp validation (reject if > 5 minutes old)
3. Idempotency key checking (prevent replay)
4. Tenant scope validation

---

## 18. DevOps Architecture

### 18.1 Infrastructure Overview

```
Development: Replit workspace (current)
Staging:     Replit deployment (staging environment)
Production:  Replit deployment or dedicated VPS (Phase 3+)

Future (Phase 4+):
  Kubernetes on GKE or EKS
  Terraform for infrastructure as code
  GitHub Actions for CI/CD
  ArgoCD for GitOps deployment
```

### 18.2 CI/CD Pipeline

```
Git Push to main
    │
    ├── [Parallel] typecheck (tsc --noEmit)
    ├── [Parallel] unit tests (vitest)
    ├── [Parallel] integration tests
    ├── [Parallel] security scan (audit + SAST)
    │
    ▼ (all pass)
Build (esbuild + vite)
    │
    ▼
Staging Deploy
    │
    ├── E2E tests (Playwright)
    ├── Performance benchmark
    ├── Smoke tests
    │
    ▼ (all pass)
Production Deploy (blue/green)
    │
    ├── Health check
    ├── Rollback on failure (automatic)
    └── Notify team (Slack)
```

### 18.3 Environment Strategy

| Environment | Purpose | DB | Data |
|-------------|---------|-----|------|
| local | Developer machine | Docker PostgreSQL | Seeded test data |
| dev | Replit workspace | Shared dev DB | Real dev data |
| staging | Pre-production | Staging DB (copy of prod schema) | Anonymized prod data |
| production | Live users | Production cluster | Real data |

### 18.4 Database Migration Strategy

```
All migrations: Drizzle ORM (schema-first)
  lib/db/src/schema/*.ts → pnpm db:push (dev only)
  lib/db/src/migrations/*.sql → applied in order on staging/prod

Migration rules:
  - Always additive (add columns, never drop)
  - Column removals: deprecate → hide → remove (3-sprint cycle)
  - Never rename a column (add new, migrate data, drop old)
  - All migrations idempotent (IF NOT EXISTS)
  - Zero-downtime migrations only (no table locks on production)
```

---

## 19. Monitoring & Observability

### 19.1 Observability Stack

```
┌────────────────────────────────────────────────────────────┐
│                   OBSERVABILITY PLATFORM                    │
│                                                            │
│  Logs         → Pino → [OpenTelemetry collector] → Grafana Loki
│  Metrics      → prom-client → Prometheus → Grafana
│  Traces       → OpenTelemetry → Tempo (distributed tracing)
│  Errors       → Sentry (frontend + backend)
│  Uptime       → Checkly or Better Uptime (external probes)
│  Alerts       → PagerDuty / Slack integration
└────────────────────────────────────────────────────────────┘
```

### 19.2 Key Metrics (SLIs)

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| API p95 latency | < 200ms | > 500ms |
| API error rate | < 0.1% | > 1% |
| Order processing time | < 500ms | > 2s |
| Event bus lag | < 1s | > 5s |
| Sync conflict rate | < 0.5% | > 2% |
| AI response time | < 3s | > 10s |
| DB query p99 | < 100ms | > 500ms |
| WebSocket connections | 100% stability | > 0.1% drop rate |

### 19.3 Distributed Tracing

Every request gets a `x-correlation-id` that flows through:
```
HTTP Request → API Gateway → Service → Event Bus → Consumer
     │               │           │          │           │
     └───────────────┴───────────┴──────────┴───────────┘
                         Same trace ID
```

Traces stored in Tempo and queryable by tenant, request type, or error.

### 19.4 Business Metrics Dashboard

```
Real-time (Grafana live):
  - Active orders per tenant
  - Revenue per hour
  - Kitchen ticket throughput
  - WebSocket connections
  - Event bus processing rate

Daily digest (automated report):
  - Total orders and revenue
  - Avg order value
  - Top selling products
  - Inventory alerts
  - Anomaly flags
```

---

## 20. Disaster Recovery

### 20.1 Recovery Objectives

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single service crash | 30 seconds (auto-restart) | 0 (stateless) |
| Database failure | 5 minutes (failover to replica) | 30 seconds (WAL streaming) |
| Region-wide outage | 2 hours (restore from backup) | 1 hour (backup frequency) |
| Data corruption | 4 hours (point-in-time recovery) | Up to 1 hour |
| Full platform loss | 8 hours (full restore) | 24 hours |

### 20.2 Backup Strategy

```
PostgreSQL:
  - Continuous WAL archiving to S3 (30-second RPO)
  - Daily full backup to S3 (retained 90 days)
  - Weekly backup to cold storage (retained 1 year)
  - Monthly backup to offsite (retained 7 years — compliance)

Redis:
  - RDB snapshots every 15 minutes to S3
  - AOF persistence enabled (sub-second RPO)

Event Store:
  - Append-only (no updates/deletes) → inherently safe
  - Replicated to read replica
  - Nightly export to S3 (parquet format for analytics)
```

### 20.3 Runbooks

Every critical failure scenario must have a runbook:
- `runbooks/db-failover.md`
- `runbooks/redis-restore.md`
- `runbooks/event-bus-recovery.md`
- `runbooks/tenant-data-corruption.md`
- `runbooks/ddos-response.md`

---

## 21. Testing Strategy

### 21.1 Test Pyramid

```
         ▲
        /E2E\          Playwright — 50 critical user journeys
       /──────\
      / Integ  \       Vitest + Supertest — service integration
     /──────────\
    /    Unit    \     Vitest — pure functions, handlers, validators
   ──────────────────
  (broad base = fast feedback)
```

### 21.2 Test Categories

| Layer | Tool | Coverage Target | Run Time |
|-------|------|----------------|----------|
| Unit | Vitest | 80%+ | < 30s |
| Integration | Vitest + test DB | 70% API routes | < 2min |
| Contract | Pact | All service boundaries | < 1min |
| E2E | Playwright | 50 critical paths | < 10min |
| Performance | k6 | P95 < 200ms under 1000 RPS | < 5min |
| Security | OWASP ZAP + custom | All auth/input paths | < 5min |
| Chaos | Chaos Monkey (future) | Service failure recovery | Manual |

### 21.3 Event-Driven Testing Pattern

```typescript
// Test event handlers in isolation
describe("InventoryService.onOrderCompleted", () => {
  it("deducts stock for each order item", async () => {
    const event = buildEvent("order:completed", {
      items: [{ productId: "p1", quantity: 2 }]
    });

    await inventoryEventHandler(event, mockDb);

    expect(mockDb.adjustInventory).toHaveBeenCalledWith("p1", -2);
    expect(mockDb.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "inventory:adjusted" })
    );
  });
});
```

### 21.4 AI Testing Strategy

```
Unit tests: Pure functions (feature extraction, model evaluation)
Integration: Mock LLM with deterministic responses (no live API in CI)
Shadow testing: Run new AI models in parallel, compare outputs offline
A/B testing: 10% of traffic to new model, measure outcomes
Regression: Model performance benchmarks run weekly
```

---

## 22. Deployment Strategy

### 22.1 Current → Target Deployment

```
Phase 0–2 (Replit):
  - Single monorepo, multiple artifacts
  - Replit deployment per artifact
  - Managed PostgreSQL (Replit or Neon)
  - Managed Redis (Upstash)

Phase 3 (Hybrid):
  - Core services on Replit (maintained)
  - AI workloads on dedicated GPU instances (RunPod / AWS)
  - Redis Cluster on Upstash (multi-zone)

Phase 4+ (Kubernetes):
  - GKE or EKS cluster
  - Helm charts per service
  - ArgoCD GitOps
  - Ingress via Nginx + Cert-Manager
  - HPA (Horizontal Pod Autoscaler) per service
```

### 22.2 Blue/Green Deployment

```
Production: Blue (v1.2.0, 100% traffic)

Deploy v1.3.0:
  1. Start Green (v1.3.0) alongside Blue
  2. Health check passes on Green
  3. Shift 10% traffic to Green (canary)
  4. Monitor error rate + latency for 5 minutes
  5. Shift 100% to Green
  6. Keep Blue running for 30 minutes (instant rollback)
  7. Decommission Blue
```

### 22.3 Feature Flags

```typescript
// config-service returns feature flags per tenant
const flags = await featureFlags.get(tenantId);

if (flags.ai_forecasting_enabled) {
  return await forecastingEngine.predict(context);
} else {
  return await legacyReport(context);
}
```

Feature flags enable:
- Gradual rollout to X% of tenants
- Instant rollback without deployment
- A/B testing at tenant level
- Beta features for opted-in tenants

---

## 23. Performance Targets

| Metric | Phase 2 Target | Phase 4 Target |
|--------|----------------|----------------|
| API response p50 | < 80ms | < 50ms |
| API response p95 | < 200ms | < 150ms |
| API response p99 | < 500ms | < 300ms |
| Order creation | < 300ms | < 100ms |
| Dashboard load | < 800ms | < 300ms |
| AI insight generation | < 5s | < 2s |
| Event processing lag | < 1s | < 200ms |
| Sync push/pull | < 2s | < 500ms |
| WebSocket message delivery | < 100ms | < 50ms |
| Max concurrent users per tenant | 50 | 500 |
| Throughput (orders/min per tenant) | 200 | 2,000 |

---

## 24. Estimated Scaling Limits

### By Phase

| Phase | Tenants | Orders/Day | Users | Data Size |
|-------|---------|-----------|-------|-----------|
| Current | 100 | 10,000 | 500 | 10 GB |
| Phase 2 | 1,000 | 100,000 | 5,000 | 200 GB |
| Phase 3 | 5,000 | 500,000 | 25,000 | 2 TB |
| Phase 4 | 25,000 | 5,000,000 | 125,000 | 20 TB |
| Phase 6 | 100,000 | 20,000,000 | 500,000 | 100 TB |

### Bottleneck Analysis

| Scaling Limit | Current Bottleneck | Resolution |
|----|----|----|
| Write throughput | Single Postgres primary | Connection pool + write replicas |
| Read throughput | Shared DB reads | Read replicas + materialized views |
| Event processing | In-process sync | BullMQ distributed workers |
| AI inference | No dedicated hardware | GPU instances (RunPod/AWS) |
| WebSocket connections | Single node WS server | Redis-backed pub/sub + horizontal scale |

---

## 25. Cost Estimation

### 25.1 Infrastructure Costs

**Phase 0–2 (Months 1–9, Replit + Managed Services)**

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Replit Core (deployments + storage) | $300–500 | |
| PostgreSQL (Neon/Supabase) | $200–300 | 16 GB database |
| Redis (Upstash) | $150–200 | Paid tier |
| CDN (Cloudflare) | $0–100 | Free or Pro |
| OpenAI API | $100–300 | If using AI features early |
| Clerk Auth | $0–500 | Per MAU, free tier available |
| Stripe | 0.5% + fixed | From revenue |
| Email (Resend) | $20–50 | Up to 100K/month |
| SMS (Twilio) | $50–100 | Pay per message |
| Monitoring (Sentry) | $50–100 | Error tracking |
| **Total** | **$900–2,050/month** | |

**Phase 3–6 (Months 10–22, Production Scale)**

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Cloud hosting (AWS/GCP) | $2,000–5,000 | Multi-region |
| Managed PostgreSQL | $500–2,000 | Larger instances |
| Redis Cluster | $300–800 | High availability |
| AI/ML Infrastructure | $1,000–5,000 | GPU instances for model training |
| Storage (S3/R2) | $100–500 | Images, PDFs, backups |
| CDN | $200–500 | Traffic scaling |
| Full monitoring stack | $300–800 | Grafana + Sentry + Tempo |
| Support (AWS/GCP) | $500–1,500 | Enterprise support |
| **Total** | **$5,200–16,600/month** | |

### 25.2 Team Costs

**Phase 0–2 (5-person team)**

| Role | Count | Monthly Cost |
|------|-------|-------------|
| Lead Architect | 1 | $5,000–7,000 |
| Backend Engineers | 2 | $4,000–6,000 each |
| Frontend Engineer | 1 | $3,500–5,500 |
| DevOps Engineer | 1 | $4,500–6,500 |
| **Total** | **5** | **$21,500–31,000/month** |

**Phase 3–6 (11-person team)**

| Role | Count | Monthly Cost |
|------|-------|-------------|
| Lead Architect | 1 | $6,000–8,000 |
| Backend Engineers | 3 | $4,500–6,500 each |
| Frontend Engineers | 2 | $4,000–6,000 each |
| Mobile Engineer | 1 | $4,000–6,000 |
| AI/ML Engineer | 1 | $5,000–8,000 |
| DevOps/SRE | 1 | $5,000–7,000 |
| QA Engineer | 1 | $3,000–4,500 |
| Product Manager | 1 | $4,000–6,000 |
| **Total** | **11** | **$40,500–62,000/month** |

### 25.3 Total 22-Month Budget

| Phase | Duration | Infra | Team | Phase Total |
|-------|----------|-------|------|-------------|
| Phase -1 | 0.5 mo | $1K | $5K | **$6K** |
| Phase 0 | 2.3 mo | $5K/mo | $26K/mo | **$72K** |
| Phase 1 | 2.5 mo | $7K/mo | $28K/mo | **$88K** |
| Phase 2 | 2.8 mo | $9K/mo | $31K/mo | **$112K** |
| Phase 3 | 3.3 mo | $11K/mo | $52K/mo | **$207K** |
| Phase 4 | 2.8 mo | $13K/mo | $51K/mo | **$179K** |
| Phase 5 | 3.7 mo | $16K/mo | $57K/mo | **$270K** |
| Phase 6 | 3.7 mo | $14K/mo | $55K/mo | **$255K** |
| **TOTAL** | **22 mo** | | | **~$1,189,000 USD** |

**In Saudi Riyals: ~4,450,000 SAR** (at 3.75 rate)

### 25.4 Break-Even Analysis

```
At launch of Phase 2 (month 9), assuming 1,000 tenants:
  Conservative (80% Starter at $20, 20% Pro at $50):
    = (800 × $20) + (200 × $50) = $26,000/month revenue

Development cost at month 9 = ~$278K spent
Monthly revenue = $26K → 11 months to recover Phase 0–2 costs

At Phase 4 launch (month 15), assuming 3,000 tenants:
  Conservative (70% Starter, 25% Pro, 5% Enterprise):
    = (2100×$20) + (750×$50) + (150×$149) = $42,000+$37,500+$22,350 = $101,850/month

Full break-even (all $1.18M): ~12–18 months post-Phase 4 launch
```

> **Funding note:** This investment typically requires VC funding or angel investment. Revenue will not cover costs until Phase 3–4. Plan for 18 months of runway before profitability.

---

## 26. Technical Risks

### Summary Table

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Event ordering issues in distributed system | Medium | High | ULID timestamps + version numbers + idempotent consumers + causation IDs |
| Offline sync data corruption | Medium | Critical | ULID IDs + immutable orders + server as source of truth + sync_conflicts table |
| Redis failure halts event bus | Low | High | PostgreSQL LISTEN/NOTIFY fallback + Upstash HA + job persistence to DB |
| AI model drift causing bad recommendations | High | Medium | Weekly retraining + A/B testing + human approval for high-stakes actions |
| OpenAI token costs spiral | Medium | High | Plan-based token budgets (starter=100/mo, pro=10K/mo) + response caching |
| Team skill gap in event sourcing | **High** | High | Phase -1 training + pair programming + weekly arch sync + external consultant option |
| Over-engineering early stages | **High** | Medium | Strangler Fig — never rewrite; wrap and migrate gradually |
| Scope creep | **High** | Medium | Feature flags gate all new behavior; strict phase completion criteria |
| Performance regression at scale | Medium | High | Load testing every phase (k6); p95 < 200ms target; alert on regression |
| Schema migration breaks production | Low | Critical | Blue-green deploy + dry-run on staging before every migration |
| Vendor lock-in with OpenAI | Low | Medium | Abstract AI Gateway — swap providers without changing business logic |
| PostgreSQL RLS policy bypass | Low | Critical | Defense in depth; automated RLS tests; penetration testing |
| Clerk service outage | Low | High | JWT cache; local session recovery for 24 hours |

### Risk Deep-Dives

**Risk 1 — Event Ordering**
```
Problem: In a distributed system events may arrive out of order.
         Example: inventory:reserved arrives before order:created

Solution:
  - ULID timestamps (time-ordered, globally unique — no UUID collisions)
  - version INT on aggregates (optimistic locking)
  - causationId field links child events to parent
  - All consumers are idempotent (safe to reprocess)
```

**Risk 2 — Offline Sync Corruption**
```
Problem: Two offline clients create the same entity → duplicate records on sync.

Solution:
  - ULID as client-generated order ID (collision-free even offline)
  - Orders are immutable after creation (no offline updates to existing orders)
  - Server validates, rejects graceful duplicates
  - sync_conflicts table logs every conflict for review
  - "server wins" on conflict unless entity type defines custom resolution
```

**Risk 3 — AI Cost Overrun**
```
Problem: At 1,000 tenants × 100 AI requests/day × 100 tokens = $1,500/day = $45,000/month

Solution:
  Tier-based token budgets:
    starter plan:    100 requests/month (cached fallback after limit)
    pro plan:        10,000 requests/month
    enterprise:      unlimited (billed separately per contract)
  
  Technical controls:
    - Response cache: same query within 1 hour → return cached result (Redis TTL)
    - Local models (Llama/Mistral via Ollama) for non-sensitive queries
    - Alert at 80% budget consumption per tenant
    - Hard cutoff at 100% — graceful degradation, not service failure
```

**Risk 4 — Phase 0 Failure Triggers**
```
If any of these occur, trigger contingency plan:
  - Event ordering cannot be made reliable after 6 weeks of effort
  - API performance degrades more than 10% after event bus introduction
  - Team cannot write a working event consumer after training
  
Recovery:
  - Revert all Phase 0 changes (Strangler Fig makes this safe — existing API unchanged)
  - Re-evaluate architecture scope
  - Reduce to simpler background jobs (no full event sourcing)
  - Bring in external distributed systems consultant
```

---

## 27. Migration Strategy

### 27.1 Strangler Fig Pattern

```
NEVER:  Rewrite service X from scratch
ALWAYS: Wrap existing behavior → add new layer → gradually migrate
```

```
Step 1: Existing REST handler works as before
          POST /api/orders → creates order → returns response

Step 2: Add event emission (non-breaking)
          POST /api/orders → creates order → ALSO emits order:created → returns response

Step 3: Add event consumers (non-breaking, additive)
          order:created → kitchen-service creates ticket (parallel to current synchronous code)

Step 4: Remove synchronous side effects from handler
          POST /api/orders → creates order → emits event → returns response
          [Synchronous kitchen ticket creation removed — now handled by consumer]

Step 5: Move read path to projection
          GET /api/orders → reads from orders_projection (materialized view) instead of raw table
```

### 27.2 Migration Sequence

```
Priority 1 (Phase 0): Foundation without breaking changes
  ✓ Add Redis connection
  ✓ Add BullMQ queue infrastructure
  ✓ Add event_store table
  ✓ Add CQRS command bus skeleton
  ✓ Maintain all existing REST endpoints unchanged

Priority 2 (Phase 1): Core order flow
  ✓ order:created event emission
  ✓ Kitchen service becomes event consumer
  ✓ Inventory auto-deduction on order:completed
  ✓ Audit log migrated to event consumer

Priority 3 (Phase 2): Real-time upgrade
  ✓ WebSocket alongside SSE (both work)
  ✓ Offline mode for POS (new capability, no migration needed)

Priority 4 (Phase 3): AI layer (new capability, no migration)

Priority 5 (Phase 4+): Remaining services event-driven
```

---

## 28. Development Phases

### Phase -1 — Pre-work & Team Preparation (Weeks 1–2)
**Goal:** Audit the codebase, prepare the team, and set up environments — before writing a single line of new architecture.

**Week 1: Code Audit**
- [ ] Read every service and every endpoint — understand all dependencies
- [ ] Map inter-service dependencies (what calls what)
- [ ] Identify the top 10 most complex/risky areas
- [ ] Document the current state with diagrams

**Week 2: Environment & Team Readiness**
- [ ] Install all required tooling (Redis, BullMQ, pgvector, Sentry)
- [ ] Run Event Sourcing + CQRS training workshop with the team (4 hours)
- [ ] Write a unified style guide for event naming, command naming, handler structure
- [ ] Set up basic CI/CD pipeline (typecheck → unit tests → deploy)
- [ ] Create monitoring dashboard (even a basic one)

**Deliverables:** Full team understands the new architecture. Environments are ready. Zero code written yet.

---

### Phase 0 — Foundation (Weeks 3–12, 10 weeks)
**Goal:** Install new infrastructure layers without breaking anything for users.

**Weeks 1–2: Infrastructure Setup**
- [ ] Add Redis (Upstash) to the project
- [ ] Add BullMQ queue infrastructure
- [ ] Add Docker Compose for local development parity
- [ ] Add PostgreSQL connection pooling (PgBouncer or Neon built-in)
- [ ] Set up basic Prometheus metrics endpoint + Grafana

**Weeks 3–4: Event Store + CQRS Skeleton**
- [ ] Create `event_store` table (append-only, indexed)
- [ ] Create `aggregate_snapshots` table
- [ ] Create `job_logs` table (BullMQ persistence)
- [ ] Write `EventBus` service (publish/subscribe)
- [ ] Write `CommandHandler` base class
- [ ] Write `QueryHandler` base class
- [ ] Unit tests for event serialization/deserialization

**Weeks 5–6: Wrap Existing Code**
- [ ] Wrap existing `POST /api/orders` to also emit `order:created` (but NOT yet process it)
- [ ] Events emitted to event store but consumers are no-ops
- [ ] All existing tests still pass — zero regressions
- [ ] Document new patterns with code examples

**Weeks 7–8: Background Job Infrastructure**
- [ ] BullMQ worker process setup (separate from API server)
- [ ] Retry logic + exponential backoff
- [ ] Dead Letter Queue + Slack/email alerts
- [ ] Job persistence and monitoring UI

**Weeks 9–10: Testing + Migration Tools**
- [ ] Unit test coverage to 60%+ on new code
- [ ] Integration tests with real test database
- [ ] Migration scripts for legacy data into event store
- [ ] Load test: simulate 100 concurrent users
- [ ] Team training: write your first event consumer (hands-on, 4 hours)

**Deliverables:** Event Bus ready. CQRS skeleton in place. Monitoring live. **Zero user-visible changes.**

---

### Phase 1 — Event-Driven Core (Weeks 13–23, 11 weeks)
**Goal:** Core order flow fully event-driven. Response time drops from 2–3s to <200ms.

**Before Phase 1:**
```
POST /api/orders → Create order + synchronously update kitchen + inventory → Return (slow)
```
**After Phase 1:**
```
POST /api/orders → Create order → Emit event → Return immediately (fast!)
    └──► [Consumer 1: Kitchen] creates ticket async
    └──► [Consumer 2: Inventory] reserves stock async
    └──► [Consumer 3: Loyalty] adds points async
    └──► [Consumer 4: Audit] writes log async
```

**Weeks 1–2: Orders Service Event-Driven**
- [ ] `order:created` triggers: `inventory:reserved`, `kitchen:ticket:created`, `customer:order:placed`
- [ ] `order:completed` triggers: `inventory:deducted`, `loyalty:points:earned`
- [ ] `order:cancelled` triggers: `inventory:released`

**Weeks 3–4: Kitchen Service as Consumer**
- [ ] Kitchen service listens to `order:created` → auto-creates ticket
- [ ] Emits `ticket:created`, `ticket:status:changed`, `ticket:completed`

**Weeks 5–6: Inventory Service as Consumer**
- [ ] Inventory service listens to `order:completed` → auto-deducts stock
- [ ] Emits `inventory:adjusted`, `inventory:low`, `inventory:depleted`
- [ ] Tests with real inventory numbers

**Weeks 7–8: Read Models & Projections**
- [ ] `orders_projection` table (denormalized, fast reads)
- [ ] `kitchen_board_state` table (current KDS state)
- [ ] `inventory_summary` table (current stock levels)
- [ ] All `GET /api/orders` reads now use projection

**Week 9: Audit & Notifications**
- [ ] Audit service listens to all events → writes `audit_log`
- [ ] Notification service: `inventory:low` → push alert to manager

**Weeks 10–11: Testing + Performance**
- [ ] E2E tests for complete order flow (create → kitchen → complete → inventory)
- [ ] Load test: 200 orders/min sustained
- [ ] Latency benchmark: p95 < 200ms for order creation
- [ ] Runbooks: "event bus is lagging", "consumer crashed"

**Deliverables:** Core flows event-driven. API response time improved by ~80%. Existing API surface unchanged.

---

### Phase 2 — Real-time + Offline (Weeks 24–35, 12 weeks)
**Goal:** POS works 100% offline. Multiple users see each other in real-time.

**Weeks 1–2: WebSocket Infrastructure**
- [ ] Socket.io server alongside existing SSE
- [ ] Channel subscriptions: `tenant:{id}`, `tenant:{id}:kitchen`, `tenant:{id}:pos`
- [ ] Presence tracking (who is online in this tenant)
- [ ] Graceful reconnect handling

**Weeks 3–4: Real-time Updates**
- [ ] Kitchen board updates in real-time via WebSocket
- [ ] POS sees inventory changes live
- [ ] Presence indicators on all screens
- [ ] Live typing indicators in order notes

**Weeks 5–6: Offline-First Web POS**
- [ ] Dexie.js setup (IndexedDB)
- [ ] Local schema: orders, products, customers, pendingSync
- [ ] Service Worker for caching product menu and tenant config
- [ ] Cache management (what stays, what expires)

**Weeks 7–8: Offline-First Mobile**
- [ ] expo-sqlite for React Native
- [ ] Local sync queue for offline orders
- [ ] Background sync on reconnect (expo-background-task)

**Weeks 9–10: Sync Engine**
- [ ] `POST /api/sync/pull` — server changes since lastSyncAt
- [ ] `POST /api/sync/push` — local changes to server
- [ ] `GET /api/sync/status` — sync health
- [ ] `sync_metadata` and `sync_conflicts` tables
- [ ] Conflict resolution rules (per entity type)

**Weeks 11–12: Failure Testing**
- [ ] Simulate network loss mid-order
- [ ] Simulate simultaneous offline edits (conflict scenarios)
- [ ] Test sync after 24h offline
- [ ] Test data consistency guarantees

**Deliverables:** POS and Kitchen work fully offline. Sync completes in < 5 seconds. WebSocket latency < 100ms.

---

### Phase 3 — AI Core (Weeks 36–49, 14 weeks)
**Goal:** First AI capabilities delivering measurable business value. Forecast accuracy > 80%.

> **AI Cost Control — Critical:**
> ```
> OpenAI at 1,000 tenants × 100 requests/day × 100 tokens = $1,500/day
> SOLUTION: Strict plan-based token budgets:
>   starter:    100 requests/month (cached results)
>   pro:        10,000 requests/month
>   enterprise: unlimited (billed separately)
> ```

**Weeks 1–2: Feature Engineering**
- [ ] Feature extraction workers consuming domain events
- [ ] Daily batch computation of `ai_feature_store`
- [ ] SQL queries for demand features (hour-of-day, day-of-week, product)

**Weeks 3–4: pgvector + Embedding Pipeline**
- [ ] pgvector extension enabled
- [ ] `entity_embeddings` table
- [ ] Embedding worker: product descriptions + customer notes → vectors
- [ ] Test semantic search (similar products)

**Weeks 5–6: Demand Forecasting**
- [ ] Collect minimum 3 months of order history (gate: require 90 days data)
- [ ] Prophet time-series model (local Python worker or JS)
- [ ] `forecast_projections` table
- [ ] Accuracy measurement vs actuals
- [ ] Show forecasts on dashboard

**Weeks 7–8: Menu Recommendations**
- [ ] Product co-purchase analysis
- [ ] Collaborative filtering model
- [ ] Show recommendations in POS checkout screen
- [ ] Click-through tracking

**Weeks 9–10: AI Gateway + Cost Control**
- [ ] AI Gateway service with plan-based routing
- [ ] Token budget tracking per tenant per month
- [ ] Response caching (same query within 1 hour → cached)
- [ ] Graceful degradation when budget exhausted

**Weeks 11–12: Natural Language Insights**
- [ ] OpenAI GPT-4o integration
- [ ] Prompt library: daily summary, anomaly explanation, product advice
- [ ] Response caching to minimize API costs
- [ ] Show insights on dashboard (refreshed nightly)

**Weeks 13–14: Learning Loop + Testing**
- [ ] Outcome tracking (was recommendation followed? did sales improve?)
- [ ] A/B test new model against previous
- [ ] AI cost monitoring dashboard
- [ ] Model accuracy reports

**Deliverables:** Forecasts, recommendations, and insights live. AI cost < $50/tenant/month at scale.

---

### Phase 4 — Workflow Engine (Weeks 50–61, 12 weeks)
**Goal:** Tenants build automations without writing code.

**Weeks 1–2: Data Model**
- [ ] `workflows`, `workflow_executions`, `workflow_steps`, `workflow_triggers` tables
- [ ] Workflow versioning and rollback support

**Weeks 3–4: Trigger Library**
- [ ] Event-based: `order:created`, `inventory:low`, `customer:returning`
- [ ] Schedule-based: daily 09:00, weekly Sunday
- [ ] Webhook inbound: external systems
- [ ] Manual: staff-initiated

**Weeks 5–6: Action Library**
- [ ] `send:notification` (push / email / SMS / in-app)
- [ ] `adjust:inventory`, `create:task`, `call:webhook`
- [ ] `wait:approval` (human-in-the-loop pause)
- [ ] `delay`, `condition:branch` (if/else)

**Weeks 7–8: Execution Engine**
- [ ] BullMQ-backed workflow runner
- [ ] Branch handling (if/else paths)
- [ ] Error handling + retry per step
- [ ] Execution log per workflow run

**Weeks 9–10: Visual Builder**
- [ ] React Flow drag-and-drop canvas
- [ ] Trigger + action blocks with configuration panels
- [ ] Connection validation (prevent invalid graphs)
- [ ] Save + publish workflow

**Weeks 11–12: Templates + Testing**
- [ ] 10 pre-built templates (low-stock reorder, VIP reward, shift summary, etc.)
- [ ] E2E tests for 5 template workflows
- [ ] Performance: 1,000 concurrent workflow executions
- [ ] Tenant-facing debugging UI

**Deliverables:** Tenants can automate reorders, alerts, and customer outreach with no code. < 1% workflow failure rate.

---

### Phase 5 — Autonomous Agents (Weeks 62–77, 16 weeks)
**Goal:** Proactive AI agents that observe, analyze, and act — with human approval gates.

**Weeks 1–3: Agent Framework**
- [ ] `AgentRuntime` infrastructure (scheduling, context, outcome tracking)
- [ ] Agent definition interface (subscribes, run(), requiresApproval)
- [ ] Approval request storage + UI
- [ ] Agent execution history

**Weeks 4–6: Inventory Agent**
- [ ] Monitor stock levels in real-time
- [ ] Predict shortages (7-day lookahead)
- [ ] Suggest reorder quantities
- [ ] Trigger purchase order workflow (with manager approval)

**Weeks 7–9: Demand Forecast Agent**
- [ ] Pre-shift prep quantity recommendations
- [ ] Weekly forecast report (email to manager)
- [ ] Seasonal adjustments (Ramadan, holidays, weekends)

**Weeks 10–12: Finance Agent**
- [ ] Daily P&L calculation and summary
- [ ] Margin alerts on products below threshold
- [ ] Cash flow anomaly detection
- [ ] End-of-month financial digest

**Weeks 13–14: Approval System**
- [ ] Approval request UI (in-app + push notification)
- [ ] Role-based routing (who approves what)
- [ ] Timeout escalation (auto-reject or escalate)
- [ ] Outcome tracking (approved → did it work?)

**Weeks 15–16: Testing + Agent Dashboard**
- [ ] Simulate 1,000 agent decisions against historical data
- [ ] Accuracy measurement (>95% target)
- [ ] Manager dashboard: agent activity log + explanations
- [ ] Disable/enable individual agents per tenant

**Deliverables:** 5 autonomous agents live. Managers trust agent recommendations (>95% accuracy). Agent actions are always explainable.

---

### Phase 6 — Platform + Marketplace (Weeks 78–93, 16 weeks)
**Goal:** FOODORO becomes an extensible platform. Partners can build on it.

**Weeks 1–4: Enterprise Tenant Isolation**
- [ ] Per-tenant PostgreSQL schema (separate schema per Enterprise tenant)
- [ ] Tenant-specific backup policies
- [ ] Dedicated resource pools for Enterprise tier

**Weeks 5–8: Plugin Architecture**
- [ ] Plugin loading system (event hooks + UI slot injection)
- [ ] Plugin sandbox (security isolation)
- [ ] Plugin marketplace backend (listing, install, uninstall)

**Weeks 9–12: Public Developer API**
- [ ] Versioned REST API for 3rd parties
- [ ] OAuth2 for app authentication
- [ ] Per-app rate limiting and usage tracking
- [ ] Webhook management UI for tenants

**Weeks 13–16: White-Label + Multi-Region**
- [ ] Custom domains (`pos.{brand}.sa`)
- [ ] Custom branding (logo, colors, no FOODORO branding)
- [ ] Multi-region read replicas
- [ ] Full documentation for developers

**Deliverables:** Platform live. 5+ apps in marketplace. White-label customers signed. Multi-region operational.

---

## 29. Timeline

```
Phase        Weeks    Start          End            Cumulative
─────────────────────────────────────────────────────────────
Phase -1       2      May 2026       May 2026       2 weeks
Phase 0       10      Jun 2026       Aug 2026       12 weeks
Phase 1       11      Aug 2026       Nov 2026       23 weeks
Phase 2       12      Nov 2026       Feb 2027       35 weeks
Phase 3       14      Feb 2027       May 2027       49 weeks
Phase 4       12      May 2027       Aug 2027       61 weeks
Phase 5       16      Aug 2027       Dec 2027       77 weeks
Phase 6       16      Dec 2027       Apr 2028       93 weeks
─────────────────────────────────────────────────────────────
TOTAL:        93      May 2026       April 2028
```

**Key Milestone Dates**

| Milestone | Date |
|-----------|------|
| Start Phase 0 (Foundation) | June 2026 |
| Event Bus live in production | November 2026 |
| Offline POS available to tenants | February 2027 |
| First AI features (forecasting + insights) | May 2027 |
| Workflow builder available | August 2027 |
| Autonomous agents live | December 2027 |
| Full platform + marketplace | **April 2028** |

> **Buffer policy:** Every phase has a built-in 20–25% buffer beyond the pure engineering estimate. Do not compress it. If a phase completes early, use the extra time for documentation, additional test coverage, and refactoring — not to start the next phase early without proper preparation.

---

## 30. Team Structure

### Current Minimum Team (Phase 0–2)

| Role | Count | Responsibilities |
|------|-------|----------------|
| Lead Architect | 1 | Architecture decisions, code review, Phase planning |
| Backend Engineers | 2 | Event bus, CQRS, services, API |
| Frontend Engineers | 2 | Web POS, offline, real-time UI |
| DevOps Engineer | 1 | Infrastructure, CI/CD, monitoring |
| **Total** | **6** | |

### Scaling to Phase 3–5

| Role | Count | Additions |
|------|-------|-----------|
| AI/ML Engineer | 2 | Forecasting, embeddings, agents |
| Mobile Engineer | 1 | Expo offline, sync |
| QA Engineer | 1 | E2E, performance, chaos |
| Product Manager | 1 | Roadmap, tenant feedback |
| **Total** | **11** | |

### Full Platform Team (Phase 6+)

| Role | Count |
|------|-------|
| Lead Architect | 1 |
| Backend Engineers | 4 |
| Frontend Engineers | 3 |
| Mobile Engineers | 2 |
| AI/ML Engineers | 3 |
| DevOps/SRE | 2 |
| QA Engineers | 2 |
| Product Managers | 2 |
| **Total** | **19** | |

---

## 31. Technology Decisions

### 31.1 Why BullMQ (not Kafka)

| Criteria | Kafka | BullMQ + Redis |
|----------|-------|----------------|
| Operational complexity | High (ZooKeeper, brokers) | Low (Redis only) |
| Cost at small scale | $300–500/month | $20–50/month |
| Latency | ~10ms | ~1ms |
| Replay | Yes (configurable retention) | Yes (Redis Streams) |
| Consumer groups | Yes | Yes |
| Upgrade path | N/A | Replace BullMQ with Kafka driver — same event contracts |
| When to upgrade | > 50M events/day | Current |

### 31.2 Why pgvector (not Pinecone)

- pgvector runs inside existing PostgreSQL — no new service
- Tenant isolation via existing RLS policies
- < 10M vectors per tenant at current scale — well within pgvector limits
- Upgrade path: export vectors to Pinecone when scale demands

### 31.3 Why Dexie.js (not PouchDB/WatermelonDB)

| Criteria | PouchDB | WatermelonDB | Dexie.js |
|----------|---------|--------------|---------|
| Bundle size | 400KB | 600KB | 60KB |
| TypeScript | Poor | Good | Excellent |
| Browser support | IndexedDB | IndexedDB | IndexedDB |
| Sync protocol | CouchDB only | Custom | Custom (our sync engine) |
| React hooks | No | Yes | Yes |

### 31.4 Why React Flow (Workflow Builder)

- Battle-tested (used by GitHub Actions, Retool, n8n)
- MIT licensed
- Excellent TypeScript support
- Handles complex graphs with hundreds of nodes
- Mobile-friendly touch events

### 31.5 Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Backend | Express 5 | 5.x |
| Frontend | React | 19.x |
| Mobile | Expo | 54.x |
| ORM | Drizzle | 0.40+ |
| Database | PostgreSQL | 16.x |
| Cache/Bus | Redis (Upstash) | 7.x |
| Queue | BullMQ | 5.x |
| Vector DB | pgvector | 0.7+ |
| AI Models | OpenAI + local | gpt-4o, embedding-3-small |
| Auth | Clerk | 6.x |
| Payments | Stripe | 22.x |
| Real-time | Socket.io or native WS | 4.x |
| Offline DB | Dexie.js | 4.x |
| Workflow UI | React Flow | 12.x |
| Testing | Vitest + Playwright | latest |
| Tracing | OpenTelemetry | latest |
| Monitoring | Sentry + Grafana | latest |

---

## 32. Future Extensibility

### 32.1 Plugin Architecture

```typescript
interface FoodorPlugin {
  id: string;
  name: string;
  version: string;
  author: string;

  // Event hooks
  onEvent?: Record<EventType, EventHandler>;

  // UI slots
  registerSlots?: {
    "pos:footer"?: React.ComponentType;
    "order:detail:actions"?: React.ComponentType<{ orderId: string }>;
    "dashboard:widgets"?: React.ComponentType[];
  };

  // API routes (sandboxed)
  registerRoutes?: (router: Router) => void;
}
```

### 32.2 Marketplace Vision

```
FOODORO Marketplace
  ├── Integrations
  │   ├── WhatsApp Business (order notifications)
  │   ├── Delivery platforms (HungerStation, Jahez)
  │   ├── Accounting (Zid, Foodics accounting)
  │   ├── Payment (Mada, STC Pay, Apple Pay)
  │   └── HR systems (time tracking, payroll)
  ├── AI Models
  │   ├── Halal certification assistant
  │   ├── Arabic menu translation
  │   └── Saudi market demand patterns
  └── Custom Widgets
      ├── Digital signage
      ├── Customer feedback kiosk
      └── Staff performance gamification
```

### 32.3 White-Label Strategy

```
Enterprise tier:
  - Custom domain: pos.{restaurantbrand}.sa
  - Custom branding (logo, colors, fonts)
  - Custom email templates
  - No FOODORO branding
  - API access for 3rd-party integrations
```

### 32.4 Multi-Region Strategy

```
Phase 5: Multi-region read replicas
  Primary write: eu-west-1 (EU data residency compliance)
  Read replicas:
    me-south-1 (Bahrain, ME-first tenants)
    ap-southeast-1 (APAC)
    us-east-1 (North America)

Phase 6: Active-active multi-region (CRDTs for conflict-free writes)
```

---

## 33. System Diagrams

### 33.1 Current Architecture

```
Browser / Mobile
      │
      │ HTTP/REST
      ▼
Express API Server (single process)
      │
      ├── Routes (auth, orders, kitchen, inventory, reports...)
      ├── SSE Broker
      ├── WebSocket Broker
      │
      ▼
PostgreSQL (single instance)
      │
      └── All tables: tenants, users, orders, kitchen_tickets,
          inventory, products, categories, customers...
```

### 33.2 Target Architecture (Phase 2)

```
Browser/Mobile
      │
      │ HTTP + WebSocket
      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API GATEWAY                               │
│  Auth (Clerk) │ Rate Limit │ Tenant Resolution │ Route Dispatch  │
└──────┬────────────────────────────────────────────┬─────────────┘
       │                                            │
   REST Commands                            WebSocket Events
       │                                            │
┌──────▼──────┐ ┌─────────┐ ┌────────────┐        │
│  Orders     │ │ Kitchen │ │ Inventory  │        │
│  Service    │ │ Service │ │ Service    │        │
└──────┬──────┘ └────┬────┘ └──────┬─────┘        │
       │             │             │               │
       └─────────────┼─────────────┘               │
                     │                             │
          ┌──────────▼──────────┐                 │
          │     Event Bus        │─────────────────┘
          │  (BullMQ + Redis)   │
          └──────────┬──────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
   ┌────▼────┐ ┌─────▼──┐ ┌─────▼──────┐
   │ Reports │ │  AI     │ │Notification│
   │ Service │ │ Service │ │ Service    │
   └─────────┘ └─────────┘ └────────────┘
        │
   ┌────▼────────────────────────────────┐
   │          DATA LAYER                  │
   │  PostgreSQL │ Redis │ pgvector │ S3  │
   └─────────────────────────────────────┘
```

### 33.3 Event Flow Diagram

```
[POS Client]
    │
    │ POST /orders (Command)
    ▼
[Orders Command Handler]
    │
    ├── Validate input (Zod)
    ├── Check inventory availability
    ├── Check coupon validity
    ├── Calculate total + tax
    ├── INSERT into orders table
    ├── INSERT into order_items table
    │
    └── EMIT → event_store + Redis Stream
                         │
                         ├──► [kitchen-service worker]
                         │         └── INSERT kitchen_ticket
                         │         └── EMIT ticket:created
                         │
                         ├──► [inventory-service worker]
                         │         └── RESERVE stock (soft lock)
                         │         └── EMIT inventory:reserved
                         │
                         ├──► [loyalty-service worker]
                         │         └── Calculate points earned
                         │         └── UPDATE customer points
                         │
                         ├──► [ai-service worker]
                         │         └── Update demand features
                         │         └── Trigger recommendation refresh
                         │
                         ├──► [audit-service worker]
                         │         └── INSERT audit_log
                         │
                         └──► [analytics-service worker]
                                   └── UPDATE dashboard_kpis projection
                                   └── UPDATE hourly_revenue projection
```

### 33.4 AI Data Flow Diagram

```
Domain Events
(order:completed, inventory:adjusted, customer:*)
      │
      ▼
[Feature Extraction Workers]
      │
      ├── Extract numeric features → ai_feature_store table
      └── Generate text descriptions → embedding queue
                    │
                    ▼
          [Embedding Worker]
                    │
                    └── OpenAI text-embedding-3-small API
                                    │
                                    ▼
                          entity_embeddings (pgvector)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
             [Forecasting]  [Recommendations]  [Insights]
                    │               │               │
             ML model         Similarity        GPT-4o
             (Prophet)        search            prompting
                    │               │               │
                    └───────────────┴───────────────┘
                                    │
                              AI Gateway
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
              [Dashboard]     [POS Widget]    [Agent Runtime]
              (forecasts)  (recommendations)  (autonomous actions)
```

### 33.5 Offline Sync Architecture

```
[POS Client - Offline Mode]
      │
      ├── All writes → IndexedDB (Dexie.js)
      │   └── pendingSync table: { entityType, entityId, operation, payload, timestamp }
      │
      ▼ (connectivity restored)

[Sync Engine]
      │
      ├── PULL: GET /api/sync/pull?since={lastSyncAt}
      │         └── Server returns all changes since lastSyncAt
      │         └── Client applies non-conflicting changes
      │
      ├── PUSH: POST /api/sync/push
      │         └── Client sends pendingSync entries
      │         └── Server validates + applies
      │         └── Returns: accepted[] + rejected[] (with server state)
      │
      └── CONFLICT RESOLUTION:
              order:created    → client wins (idempotent, ULID as ID)
              order:status     → server wins (higher state wins)
              inventory:delta  → merge (additive)
              product:price    → server timestamp wins
```

### 33.6 Multi-Tenant Isolation Diagram

```
Incoming Request
      │
      │ x-tenant-id header OR subdomain
      ▼
[requireTenant middleware]
      │
      ├── Resolve tenant from header/subdomain
      ├── Acquire dedicated pg.PoolClient
      ├── SET app.current_tenant_id = '{id}' on connection
      ├── Attach req.tenantId and req.db to request
      │
      ▼
[Route Handler uses req.db]
      │
      ▼
[PostgreSQL]
      │
      ├── RLS Policy: USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
      │
      └── Only rows matching current tenant are visible
            (enforced at DB level — cannot be bypassed by application code)
```

---

## Appendix A — Glossary

| Term | Definition |
|------|------------|
| Aggregate | A cluster of domain objects treated as one unit for data changes |
| CQRS | Command Query Responsibility Segregation — separate write and read models |
| DLQ | Dead Letter Queue — holds failed messages for inspection and retry |
| Domain Event | An immutable record of something that happened in the business domain |
| Event Bus | Infrastructure that routes events from publishers to subscribers |
| Event Sourcing | Storing state as a sequence of events rather than current values |
| Event Store | Append-only storage for all domain events |
| Projection | A read model built by processing a stream of events |
| RLS | Row-Level Security — PostgreSQL feature for multi-tenant isolation |
| ULID | Universally Unique Lexicographically Sortable Identifier |
| Vector Clock | Data structure for tracking causality across distributed systems |

---

## Appendix B — Decision Log

| Date | Decision | Reason | Alternatives Considered |
|------|----------|--------|------------------------|
| May 2026 | BullMQ over Kafka | Cost + complexity at current scale | Kafka, RabbitMQ |
| May 2026 | pgvector over Pinecone | No new service, RLS for free | Pinecone, Weaviate, Chroma |
| May 2026 | Strangler Fig over Big Rewrite | Zero downtime, risk reduction | Full rewrite |
| May 2026 | Dexie.js over WatermelonDB | Smaller bundle, better TS | WatermelonDB, PouchDB |
| May 2026 | Redis Streams over SQS | Lower latency, same Redis instance | SQS, SNS |

---

**Document Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | May 2026 | Engineering Team | Initial release |
| 1.1 | May 2026 | Engineering Team | Realistic timeline corrections (64→93 weeks); cost breakdown with team salaries; Phase -1 added; week-by-week phase breakdowns; success criteria per phase; contingency plans; feature flags strategy; AI cost control details; codebase size analysis; 5 bottleneck analysis; new DB tables (job_logs, orders_projection, kitchen_board_state, inventory_summary, sync_metadata, sync_conflicts) |

---

## Appendix C — Success Criteria per Phase

> Phase is only **complete** when ALL criteria are met. Do not advance to the next phase otherwise.

### Phase -1
- [ ] Full team has read and discussed this document
- [ ] All environments (Redis, BullMQ test queue, Sentry) are working locally
- [ ] CI/CD pipeline runs typecheck + unit tests on every PR
- [ ] Unified code style guide published and agreed upon
- [ ] Every engineer can explain: what is an event? what is a consumer? what is a command?

### Phase 0
- [ ] EventBus emits 100% of domain events (verified by test)
- [ ] Zero data loss during event processing (verified by chaos test)
- [ ] API response times unchanged from baseline (p95 < 200ms)
- [ ] Any engineer can write a new event consumer from scratch
- [ ] Monitoring shows event flow in real-time
- [ ] Zero unplanned production downtime during migration

### Phase 1
- [ ] 100% of orders processed via event stream (no synchronous side effects remain)
- [ ] Kitchen tickets auto-created from `order:created` events (zero manual steps)
- [ ] Inventory auto-deducted on `order:completed` (zero manual steps)
- [ ] Audit trail is complete and queryable for 100% of domain events
- [ ] Zero data inconsistencies between `orders` and `orders_projection`
- [ ] Load test passes: 200 orders/minute sustained for 10 minutes

### Phase 2
- [ ] POS works 100% offline (verified by cutting network mid-session)
- [ ] Sync completes in < 5 seconds after reconnect
- [ ] Conflict resolution is accurate in 100% of tested scenarios
- [ ] WebSocket updates arrive in < 100ms (measured end-to-end)
- [ ] Mobile app syncs reliably after 24h offline

### Phase 3
- [ ] Forecasts available for 80%+ of active products
- [ ] Forecast accuracy > 80% (measured against actual next-week sales)
- [ ] Recommendation click-through rate > 5% (in POS checkout)
- [ ] AI insights generated automatically every night
- [ ] AI costs < $50/tenant/month at 1,000 tenant scale (modeled)
- [ ] Token budget enforcement verified: budget exhausted → graceful fallback

### Phase 4
- [ ] 10+ pre-built workflow templates available
- [ ] Tenant-created workflows execute reliably (< 1% failure rate)
- [ ] Approval workflows route correctly by role
- [ ] Workflow engine 100% uptime over 30-day observation
- [ ] Tenants can create a new automation without engineering help

### Phase 5
- [ ] 5 autonomous agents deployed and active
- [ ] Agents make correct decisions in > 95% of historical simulations
- [ ] All agent actions logged with explanations (auditable)
- [ ] Manager approval gates work as expected (route, timeout, escalate)
- [ ] Managers report trusting agent recommendations (qualitative)

### Phase 6
- [ ] Plugin system live with stable public API
- [ ] 5+ apps available in marketplace (at least 2 from external partners)
- [ ] White-label customer(s) signed and operational
- [ ] Multi-region deployment working (writes go to primary, reads from nearest)
- [ ] Platform revenue > 20% of total revenue

---

## Appendix D — Contingency Plans

### If a Phase is 4+ Weeks Behind

**Option 1 (Recommended):** Defer Phase 6 (Marketplace) to a Phase 7 after the planned timeline. Focus on delivering Phases 0–5 at high quality. Marketplace is important but not core POS operations.

**Option 2:** Reduce feature scope within the delayed phase. Skip white-label in Phase 6. Skip Finance Agent in Phase 5. Deliver core functionality.

**Option 3:** Extend the timeline by 4 weeks. Quality > speed. A delayed launch beats a buggy one.

### If Infrastructure Costs Exceed Budget by 50%

**Option 1:** Move AI workloads to cheaper providers (Groq for inference, self-hosted Ollama for common queries). Redis → downgrade Upstash tier. PostgreSQL → move to Neon free tier for non-prod.

**Option 2:** Phase-based hiring. Do not hire the full Phase 3–6 team until Phase 2 is complete and generating revenue.

**Option 3:** Raise a seed/pre-Series A round. At Phase 2 launch (offline POS + real-time + multi-tenant), the product is demonstrably valuable.

### If Phase 0 Fails (Cannot Get Event Architecture Right)

**Failure triggers:**
- Cannot achieve reliable event ordering after 8 weeks of effort
- API performance degraded by > 10% after event bus introduction
- Team cannot write a correct event consumer after training and pair programming

**Recovery steps:**
1. Revert all Phase 0 changes (Strangler Fig makes this safe — existing API still works)
2. Re-evaluate scope: simplify to background job queue without full event sourcing
3. Bring in an external distributed systems consultant for 2–4 weeks
4. Re-attempt Phase 0 with reduced scope (BullMQ async jobs only, no event store)

### If AI Costs Spiral Out of Control

1. Immediately enforce Starter plan limits (100 requests/month hard cap)
2. Enable response cache for all AI endpoints (Redis, 1-hour TTL)
3. Switch common queries to local Llama/Mistral model (free after one-time setup)
4. Audit which tenants are consuming the most tokens → offer Enterprise pricing
5. As last resort: temporarily disable AI features for Starter plan tenants

---

## Appendix E — Feature Flags & Rollout Strategy

All new architectural behavior must be gated behind feature flags during rollout. Never flip the switch for all tenants at once.

### Flag Implementation

```typescript
// Environment-variable-based feature flags (Phase 0–2)
const featureFlags = {
  EVENT_BUS_ENABLED:     process.env.FF_EVENT_BUS     === 'true',
  OFFLINE_SYNC_ENABLED:  process.env.FF_OFFLINE_SYNC  === 'true',
  WEBSOCKET_ENABLED:     process.env.FF_WEBSOCKET      === 'true',
  AI_FORECASTING:        process.env.FF_AI_FORECAST    === 'true',
  WORKFLOW_ENGINE:       process.env.FF_WORKFLOWS       === 'true',
  AUTONOMOUS_AGENTS:     process.env.FF_AGENTS          === 'true',
};

// Usage in code:
if (featureFlags.EVENT_BUS_ENABLED) {
  await eventBus.emit('order:created', orderPayload);
}
// Old synchronous path below is the fallback when flag is off
```

### Rollout Sequence

```
Phase 0 rollout:
  Week 1–8:   FF_EVENT_BUS=false    (all events go to /dev/null, no consumers)
  Week 9:     FF_EVENT_BUS=true     (enable on 10% of tenants, parallel run)
  Week 10:    FF_EVENT_BUS=true     (all tenants — after 1 week of comparison)

Phase 1 rollout:
  When event bus stable for 2 weeks:
    Enable Kitchen consumer on staging → 10% tenants → all tenants
    Enable Inventory consumer on staging → 10% tenants → all tenants
    Disable old synchronous side effects only after 2 weeks stable

Phase 2 rollout:
  FF_WEBSOCKET=true       (additive — SSE still works in parallel)
  FF_OFFLINE_SYNC=true    (opt-in per tenant initially)

Phase 3+:
  Gradual per-plan rollout
  AI features available on Pro plan first, then Starter with limits
```

---

## Appendix F — Team Training Schedule

### Phase -1 Training (Week 2)

| Session | Duration | Content |
|---------|----------|---------|
| Event Sourcing concepts | 2 hours | What is an event? Immutability. Event store. Why not just update the DB? |
| CQRS patterns | 2 hours | Commands vs Queries. Write model vs Read model. Projection strategy. |
| Architecture demo | 1 hour | Walkthrough of the new system with diagrams |
| Hands-on: emit your first event | 2 hours | Pair programming session |
| Q&A open session | 1 hour | Questions, concerns, edge cases |

### Phase 0 Training (Week 3–4)

| Session | Duration | Content |
|---------|----------|---------|
| Write your first consumer | 4 hours | Hands-on: create an event consumer from scratch |
| Code review workshop | 2 hours | Review first PRs together; calibrate standards |

### Phase 1 Training (Week 10 of phase)

| Session | Duration | Content |
|---------|----------|---------|
| Event ordering and idempotency | 2 hours | Why ordering matters. How to make consumers safe to re-run. |
| Conflict resolution patterns | 2 hours | Last-write-wins vs merge strategies vs manual resolution |

### Phase 2 Training

| Session | Duration | Content |
|---------|----------|---------|
| Offline-first patterns | 3 hours | IndexedDB, service workers, sync queues |
| Sync protocol deep dive | 2 hours | Pull/push protocol, vector clocks, conflict types |

### Ongoing (All Phases)

- **Weekly 30-min architectural sync** — what was built this week, any patterns to discuss
- **Bi-weekly code review** — 1 hour focused on new architectural patterns only
- **Monthly tech talks** — 1 engineer presents a topic (event sourcing pitfalls, AI cost optimization, etc.)

---

*This document is the authoritative technical specification for FOODORO's evolution into an Enterprise AI Operating System. All development work in Phases 0–6 must align with this document. Deviations require architecture review approval.*

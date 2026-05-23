# FOODPRO POS — Test Credentials

## Demo Account
- **Email**: `demo@foodpro.com`
- **Password**: `Demo2026!`
- **Restaurant**: FoodPro Demo
- **Plan**: Enterprise / Active (1-year)

## Brute-force protection (auth)
- Block triggers at **6+ failed attempts** for the SAME (email + IP) combo within 15 min.
- A wider DoS guard fires at **50+ failures** for one IP across any email.
- Failures are cleared on a successful login for that email.
- Reset stuck state with:
  `psql "$DATABASE_URL" -c "UPDATE security_events SET resolved=true WHERE type='login_failed' AND resolved=false;"`

## Database
- postgresql://foodoro:foodoro123@localhost:5432/foodoro_db
- App role: `foodoro_app` (used by RLS)

## Services (supervisor)
- `backend`     — Express 5 on :8001
- `frontend`    — Vite preview on :3000  (build: `cd /app/artifacts/foodoro && pnpm run build && sudo supervisorctl restart frontend`)
- `ai-sidecar`  — Python FastAPI on :9000
- `mongodb`     — :27017 (legacy, not used by app)

After backend code changes: `cd /app/artifacts/api-server && pnpm run build && sudo supervisorctl restart backend`

## Subscription endpoints (live)
- **Public**:
  - `GET  /api/subscription/plans`           — plan catalog
  - `POST /api/paddle/webhook`               — Paddle webhook (raw body, HMAC verified)
- **Authenticated**:
  - `GET  /api/subscription`                  — current plan + usage + daysLeft
  - `POST /api/subscription/checkout`         — create Paddle checkout (mocked when keys absent)
  - `POST /api/subscription/upgrade`          — immediate upgrade
  - `POST /api/subscription/downgrade`        — scheduled at period end
  - `POST /api/subscription/cancel`/`/resume`
  - `GET  /api/subscription/invoices`
  - `GET  /api/subscription/notifications`
- **Uploads**:
  - `POST /api/uploads/image`                — multipart, max 4 MB
  - `POST /api/uploads/image-base64`         — `{ dataUrl }`
- **Leads (public)**:
  - `POST /api/leads`                        — marketing-form submission

## AI Configuration
- **Model**: Claude Haiku 4.5 via Emergent Universal LLM Key
- Endpoint: `/api/ai/chat`
- Budget exhaustion → HTTP 402, `{"error":"AI_BUDGET_EXCEEDED"}`

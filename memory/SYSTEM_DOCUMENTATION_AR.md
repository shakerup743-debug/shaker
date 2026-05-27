# 📚 FOODPRO POS — وثيقة النظام الشاملة (بالعربية)

> آخر تحديث: 23 فبراير 2026
> الإصدار: 2.6 (Anti-Fraud QR + Product Variants + Auth Hardening)

---

## 0. نظرة عامة على المنتج

**FOODPRO POS** هو نظام إدارة مطاعم متكامل من نوع **SaaS متعدد المستأجرين** (Multi-Tenant). كل مطعم يعمل في عزل بياناتي تام عن غيره (Row-Level Security). النظام مصمم لاستخدام **شامل وحقيقي** في المطاعم لا مجرد عرض.

### الجمهور المستهدف
- مطاعم خدمة كاملة (Full-service)
- مقاهي ومطاعم Quick Service
- سلاسل مطاعم متعددة الفروع
- خدمة QR Menu للسياح في الأماكن السياحية

### الأهداف الكبرى
1. **بيع كامل** عبر POS تقليدي + QR Menu للعميل من طاولته.
2. **مطبخ موصول** (KDS) يستلم الطلبات فور إنشائها (real-time WebSocket).
3. **عزل بين المطاعم** (Tenant Isolation) عبر Postgres RLS.
4. **حماية مالية وأمنية** قوية: Master Password, MFA, RBAC, Audit log, Anti-Fraud لطلبات QR.
5. **عمل بدون إنترنت** (PWA + Service Worker + Dexie IndexedDB).
6. **اشتراكات SaaS مدفوعة** عبر Paddle Billing v2 (Starter / Pro / Enterprise).

---

## 1. التقنيات (Tech Stack)

| الطبقة         | التقنية                              |
|----------------|--------------------------------------|
| Backend        | Node.js 20 + Express 5 + TypeScript ESM  |
| Frontend       | React 19 + Vite 7 + Wouter + Tailwind   |
| Database       | PostgreSQL 15 + Drizzle ORM + RLS        |
| Realtime       | `ws` (WebSocket) على `/ws` و `/api/ws`  |
| Auth           | JWT + bcrypt (rounds=12) + Roster + PIN |
| AI sidecar     | Python FastAPI + emergentintegrations (Claude Haiku 4.5) |
| Payments       | Paddle Billing v2 (HMAC + sandbox/mock) |
| Image upload   | multer + base64 + static `/uploads`     |
| Realtime ops   | SSE (`/api/events`) + WS               |
| PWA            | vite-plugin-pwa + Workbox + Dexie       |
| i18n           | react-i18next (25 لغة مسجلة)            |
| Package mgmt   | pnpm 9.15.5 monorepo (workspaces)       |
| Process mgr    | Supervisor (4 خدمات)                     |

---

## 2. هيكل المستودع (Monorepo)

```
/app
├── artifacts/
│   ├── api-server/          # خادم Express (Port 8001)
│   │   ├── src/
│   │   │   ├── index.ts     # نقطة الدخول
│   │   │   ├── routes/      # 44 ملف routing
│   │   │   ├── middleware/  # authenticate, requireTenant, audit, rls, ...
│   │   │   ├── lib/         # qr-security, paddle, ws, sse-broker, audit
│   │   │   ├── jobs/        # availability-scheduler
│   │   │   └── plugins/     # plan-gating
│   │   └── .env
│   │
│   ├── foodoro/             # واجهة React (Port 3000)
│   │   ├── src/
│   │   │   ├── App.tsx      # Router الرئيسي
│   │   │   ├── pages/       # 44 صفحة
│   │   │   ├── components/  # layout, can, ui, qr/identity-modal, …
│   │   │   ├── hooks/       # use-toast, use-auth, …
│   │   │   ├── lib/         # device-fingerprint, notifications, api-client
│   │   │   └── i18n/locales # ar.json, en.json (+23 stub)
│   │   └── .env
│   │
│   └── ai-sidecar/          # Python FastAPI (Port 9000) — AI chatbot
│
├── lib/db/                  # Drizzle Schema + Migrations
│   └── src/
│       ├── schema/          # 22 ملف schema
│       └── migrations/      # 13 SQL migration
│
├── scripts/
│   └── bootstrap.sh         # idempotent boot — يخلق الجداول + Seeds
│
├── pgdata/                  # بيانات Postgres الدائمة
├── backend/tests/           # اختبارات pytest
├── memory/                  # PRD + test_credentials + هذه الوثيقة
└── test_reports/            # تقارير subagent
```

---

## 3. الخدمات والمنافذ (Supervisor)

| الخدمة      | الميناء | الأمر                                          |
|-------------|---------|------------------------------------------------|
| `backend`   | 8001    | Express 5 production build (`pnpm run build && node dist/index.mjs`) |
| `frontend`  | 3000    | Vite preview على build الإنتاجي                |
| `ai-sidecar`| 9000    | Python FastAPI + Claude Haiku 4.5              |
| `mongodb`   | 27017   | (موجود لكن غير مستخدم — قديم)                  |
| `postgres`  | 5432    | يبدأ عبر `/app/scripts/bootstrap.sh`           |

**Hot reload** متاح في وضع التطوير. عند تعديل كود الـ backend:
```bash
cd /app/artifacts/api-server && pnpm run build && sudo supervisorctl restart backend
```
عند تعديل React:
```bash
cd /app/artifacts/foodoro && pnpm run build && sudo supervisorctl restart frontend
```

---

## 4. متغيرات البيئة (.env)

### Backend (`/app/artifacts/api-server/.env`)
- `DATABASE_URL=postgresql://foodoro:foodoro123@localhost:5432/foodoro_db`
- `JWT_SECRET=<32+ chars>`
- `PORT=8001`
- `NODE_ENV=development`
- `SESSION_SECRET=<change in production>`
- `EMERGENT_LLM_KEY=sk-emergent-***` ← يُستخدم لـ Claude Haiku عبر AI sidecar
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET` (اختياري — sandbox/mock بدونها)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (للـ OTP الحقيقي — حالياً Stub)

### Frontend (`/app/artifacts/foodoro/.env`)
- `REACT_APP_BACKEND_URL=https://<preview-url>`
- `VITE_API_BASE` (= نفس URL أعلاه)

---

## 5. قاعدة البيانات — مخطط كامل (44 جدول)

### مجموعة Tenants / Multi-tenancy
| الجدول | الوصف |
|--------|-------|
| `tenants` | المطاعم. أعمدة بارزة: `plan`, `demo_mode`, `paddle_customer_id`, `paddle_subscription_id`, `settings JSONB` |
| `branches` | الفروع لكل مطعم |
| `subscriptions` | اشتراك Paddle (status, current_period_end, plan) |
| `billing_events` | أحداث Paddle webhook |

### Users / Auth / Sessions
| الجدول | الوصف |
|--------|-------|
| `users` | مستخدم (`tenant_id`, `role`, `email`, `pin_hash`, `mfa_enabled`, `mfa_secret`) |
| `user_sessions` | جلسات login + IP + UA + device_fingerprint |
| `security_events` | محاولات login فاشلة + نوع الحدث (low/medium/high) |
| `master_passwords` | كلمة المرور الرئيسية للعمليات الحساسة (bcrypt rounds=12, 8 backup codes) |
| `master_pw_sessions` | جلسات Master Password المؤقتة |
| `protected_operations` | تعريف العمليات المحمية |
| `protected_operation_logs` | سجل تنفيذ العمليات المحمية |

### المنتجات والقوائم
| الجدول | الوصف |
|--------|-------|
| `categories` | فئات المنتجات (لون + أيقونة) |
| `products` | منتج + `option_groups JSONB` (sizes / add-ons) + `image_url` + `kitchen_available` + `unavailable_until` |
| `product_ingredients` | ربط المنتج بمكونات المخزون |
| `product_availability_log` | متى تم تعطيل/تفعيل المنتج |

### المخزون والإهدار
| الجدول | الوصف |
|--------|-------|
| `inventory` | عناصر المخزون (`unit`, `quantity`, `low_stock_threshold`) |
| `inventory_consumption_log` | استهلاك تلقائي عند إكمال الطلبات |
| `waste_logs` | سجل الإهدار + السبب |
| `suppliers` | الموردون |
| `supplier_orders` | أوامر الشراء |
| `supplier_order_items` | بنود أوامر الشراء |

### الطلبات والمطبخ
| الجدول | الوصف |
|--------|-------|
| `orders` | الطلب (`total`, `tax`, `discount`, `status`, `customer_name`, `customer_phone`, `source`, `kitchen_ready_at`, `completion_token`) |
| `order_items` | بنود الطلب (`base_unit_price`, `selected_options JSONB`, `item_note`) |
| `order_amendments` | تعديلات على الطلب (إضافة/حذف/تغيير) مع تتبع المعتمد |
| `kitchen_tickets` | تذكرة المطبخ المرتبطة بالطلب |
| `discount_logs` | كل تخفيض مُطبَّق + سبب إلزامي + الكاشير الذي طبّقه |

### الكاشير والورديات
| الجدول | الوصف |
|--------|-------|
| `cashier_shifts` | وردية (start_cash, end_cash, expected_cash, variance, manager_pin_verified_by) |

### العملاء والولاء
| الجدول | الوصف |
|--------|-------|
| `customers` | عميل (`phone`, `email`, `total_spent`, `visit_count`, `loyalty_points`) |
| `customer_notes` | ملاحظات على العميل |
| `loyalty_transactions` | كسب/استبدال نقاط الولاء |

### الكوبونات والخصومات
| الجدول | الوصف |
|--------|-------|
| `coupons` | كوبونات (`code`, `discount_type`, `discount_value`, `valid_from`, `valid_to`, `max_uses`) |
| `coupon_usage` | استخدامات الكوبون |
| `discount_settings` | إعدادات الخصومات لكل دور (نسبة + مبلغ + استخدام يومي + سبب إلزامي) |

### الطاولات و QR
| الجدول | الوصف |
|--------|-------|
| `restaurant_tables` | الطاولات (`number`, `capacity`, `floor`, `status`) |
| `table_reservations` | الحجوزات |
| `qr_tokens` | رمز QR ربط بطاولة + `is_active` + `session_expires_at` |

### Anti-Fraud (طلبات QR)
> ⚠️ يتم إنشاء هذه الجداول ديناميكياً عبر `qr-security.ts` ومسارات `/public/qr/*`. ينبغي إضافتها إلى `bootstrap.sh` لضمان الاستمرارية.

| الجدول | الوصف |
|--------|-------|
| `qr_scans` | كل عملية مسح QR (fingerprint + IP + UA + table_number) |
| `qr_order_security` | حالة الأمان لكل طلب QR (`fraud_score`, `fraud_flags JSONB`, `risk_level`, `status`: pending_approval / accepted / rejected / fraud_blocked, `cashier_approval`, `otp_verified`) |
| `whatsapp_otps` | OTP لكل عميل (5 محاولات، 10 دقائق، single-use) |
| `fraud_attempts` | كل محاولة احتيال مكتشفة (severity + action_taken) |
| `security_blacklist` | حظر بـ phone / device_fingerprint / IP / qr_token (مع expires_at) |

### Audit / Notifications / Webhooks
| الجدول | الوصف |
|--------|-------|
| `audit_logs` | كل create/update/delete مع user + IP + body المنقّى |
| `app_notifications` | إشعارات داخل التطبيق |
| `webhooks` | روابط webhooks للعملاء (Pro plan فقط) |
| `webhook_logs` | سجل تسليم webhooks |
| `leads` | نماذج التسويق (landing page) |
| `exchange_rates` | أسعار الصرف الحية (Frankfurter + open.er-api.com — 166 عملة، base SAR) |
| `invoice_settings` | شعار الفاتورة + حجم الورق + نص الترحيب + QR العام |

---

## 6. الأمان والمصادقة

### Login flow
1. `POST /api/auth/login` → email + password.
2. التحقق بـ bcrypt.
3. **Brute-force protection محسّن** (تم إصلاحه 2026-02-23):
   - حد أساسي: **6 محاولات فاشلة** لـ (email + IP) خلال 15 دقيقة.
   - حد DoS أوسع: **50 محاولة فاشلة** لـ IP واحد عبر أي email.
   - يتم **مسح الحظر تلقائياً** عند نجاح تسجيل الدخول.
4. إصدار JWT صالح لمدة 7 أيام موقّع بـ `JWT_SECRET`.
5. تسجيل الجلسة في `user_sessions` مع device fingerprint.

### PIN login (للكاشير)
- `POST /api/auth/pin-login` → `userId` + `pin` (4-6 أرقام).
- بدون كلمة مرور — مخصص للسرعة على الكاشير.
- خاضع لنفس Brute-force.

### MFA (TOTP)
- `POST /api/security/mfa/setup` → يولد `mfa_secret_pending` + QR code.
- `POST /api/security/mfa/verify` → يثبت السر.
- بعد التفعيل: login يطلب رمز TOTP إذا كان `mfa_enabled=true`.

### Master Password
- مستقل عن كلمة مرور المستخدم.
- مطلوب لتنفيذ **العمليات المحمية** (مثلاً: حذف منتج، تصفير وردية، تعديل بعد closing).
- `bcrypt rounds=12` + **8 backup codes** (single-use).
- جلسة Master Password صالحة لمدة محددة في `master_pw_sessions`.

### RBAC — 10 أدوار
| الدور            | الصلاحيات |
|------------------|----------|
| `platform_admin` | مالك المنصة (كل شيء عبر كل المطاعم) |
| `owner`          | مالك المطعم |
| `admin`          | أدمن المطعم |
| `area_manager`   | مدير منطقة (عدة فروع) |
| `branch_manager` | مدير فرع |
| `accountant`     | محاسب (تقارير + فواتير، بدون CRUD منتجات) |
| `inventory_manager` | مدير مخزون |
| `cashier`        | كاشير (طلبات + خصومات بحدود) |
| `kitchen`        | مطبخ (KDS فقط) |
| `waiter`         | نادل |

التطبيق: `authorize("admin", "owner")` على المسارات + `<Can perm="…">` في React.

### Row-Level Security (RLS)
- ملف `lib/db/src/migrations/rls-tenant-isolation.sql` + `rls-extended-isolation.sql`
- كل جدول حساس له policy: `tenant_id = current_setting('app.tenant_id')::int`.
- الـ backend يضبط `app.tenant_id` لكل طلب عبر middleware `requireTenant`.
- دور قاعدة البيانات `foodoro_app` (مستخدم RLS).

---

## 7. API Endpoints — الكامل (203+ endpoint)

> كل المسارات تبدأ بـ `/api`. الجداول هنا تختصر مسار `/api`.

### Auth & Sessions
| Method | Path | Auth | الوصف |
|--------|------|------|------|
| POST | `/auth/login` | عام | تسجيل دخول |
| POST | `/auth/pin-login` | عام | PIN للكاشير |
| POST | `/auth/signup` | عام | تسجيل مطعم جديد (25 نوع نشاط) |
| POST | `/auth/google/session` | عام | Google OAuth |
| GET  | `/auth/me` | JWT | المستخدم الحالي |
| POST | `/auth/refresh` | JWT | تجديد التوكن |
| POST | `/auth/logout` | JWT | خروج |
| POST | `/auth/roster` | عام | قائمة الكاشيرين المتاحين للـ PIN login |

### Security
| Method | Path | الوصف |
|--------|------|------|
| GET  | `/security/master-password/status` | حالة كلمة المرور الرئيسية |
| POST | `/security/master-password/create` | إنشاء |
| PATCH| `/security/master-password/change` | تغيير |
| POST | `/security/verify-master-password` | تحقق |
| POST | `/master-password/session/start` | بدء جلسة |
| POST | `/master-password/session/check` | تحقق من جلسة نشطة |
| POST | `/master-password/session/end` | إنهاء |
| GET  | `/security/operations` | قائمة العمليات المحمية |
| PATCH| `/security/operations/:id` | تعديل |
| GET  | `/security/operations/logs` | سجل |
| POST | `/security/mfa/setup` / `/verify` | إعداد MFA |
| DELETE | `/security/mfa` | تعطيل MFA |
| GET  | `/security/sessions` | الجلسات النشطة |
| DELETE | `/security/sessions/:id` | إنهاء جلسة |

### Products / Categories / Inventory
| Method | Path | الوصف |
|--------|------|------|
| GET/POST/PATCH/DELETE | `/products` | CRUD منتجات + `option_groups` |
| GET | `/products/:id` | تفاصيل |
| GET/POST/PATCH/DELETE | `/categories` | CRUD فئات |
| GET/POST/PATCH | `/inventory` | المخزون + log |
| POST | `/inventory/:id/adjust` | تعديل كمية |

### Orders / Kitchen
| Method | Path | الوصف |
|--------|------|------|
| GET/POST | `/orders` | إنشاء طلب + حساب الضريبة (15%) |
| GET | `/orders/:id` | تفاصيل |
| PATCH | `/orders/:id` | تعديل |
| POST | `/orders/:id/complete` | إغلاق + تثبيت المخزون |
| GET | `/kitchen/tickets` | تذاكر المطبخ |
| PATCH | `/kitchen/tickets/:id` | تحديث الحالة |
| GET | `/kitchen/availability` | المنتجات المعطلة |
| PATCH | `/kitchen/availability/:id` | تعطيل/تفعيل منتج |

### Customers / Loyalty
| GET/POST/PATCH/DELETE | `/customers` | CRUD |
| GET | `/customers/:id` | تفاصيل |
| GET | `/customers/stats/summary` | إحصائيات |
| POST | `/customers/:id/notes` | ملاحظة |
| GET/POST | `/loyalty/:customerId` | كسب/استبدال نقاط |
| GET | `/loyalty/leaderboard` | أعلى عملاء |

### Public (QR Menu)
| POST | `/public/qr/scan` | تسجيل مسح QR |
| GET | `/public/qr/:token` | قائمة QR للعميل |
| GET | `/public/menu` | قائمة عامة |
| POST | `/public/orders` | إنشاء طلب QR |
| POST | `/public/qr/otp/verify` | تحقق OTP |
| POST | `/public/qr/otp/resend` | إعادة إرسال OTP |

### Anti-Fraud Admin (محمي)
| GET | `/admin/fraud/stats` | إحصائيات (today/blocked/pending) |
| GET | `/admin/fraud/attempts?limit=30` | آخر المحاولات |
| GET | `/admin/fraud/pending` | بانتظار موافقة الكاشير |
| POST | `/admin/fraud/orders/:id/approve` | موافقة |
| POST | `/admin/fraud/orders/:id/reject` | رفض + حظر تلقائي 7 أيام |
| GET | `/admin/fraud/blacklist` | القائمة السوداء |
| POST | `/admin/fraud/blacklist` | إضافة |
| DELETE | `/admin/fraud/blacklist/:id` | إلغاء الحظر |

### Cashier / Shifts / Amendments
| GET/POST | `/cashier/shifts` | الورديات |
| GET | `/cashier/shifts/current` | الوردية الحالية |
| POST | `/cashier/shifts/start` / `/end` | بدء/إنهاء وردية |
| POST | `/cashier/verify-manager` | تحقق PIN المدير |
| POST | `/cashier/pin-login` | PIN login للكاشير |
| GET/POST/PATCH | `/amendments` | تعديلات الطلبات |

### Reports / Analytics
| GET | `/reports/dashboard` | KPI شامل |
| GET | `/reports/daily` / `/hourly` / `/by-weekday` | تقارير |
| GET | `/reports/top-products` | الأفضل مبيعاً |
| GET | `/reports/by-category` | حسب الفئة |
| GET | `/reports/kpis` | (Pro فقط) |
| GET | `/reports/monthly` / `/yearly` | (Pro فقط) |

### AI
| POST | `/ai/chat` | محادثة مع Claude Haiku |
| GET | `/ai/insights` | استنتاجات |
| GET | `/ai/financial-summary` | ملخص مالي |
| GET | `/ai/forecast` | توقع |
| GET | `/ai/inventory-health` | صحة المخزون |
| GET | `/ai/top-performers` | أعلى أداء |

### Subscription / Billing (Paddle)
| GET | `/subscription` | حالة الاشتراك |
| GET | `/subscription/plans` | الخطط |
| POST | `/subscription/checkout` | إنشاء checkout |
| POST | `/subscription/upgrade` / `/downgrade` / `/cancel` / `/resume` |
| GET | `/subscription/invoices` | الفواتير |
| GET | `/subscription/notifications` | إشعارات الفوترة |
| POST | `/paddle/webhook` | استقبال Paddle webhook (HMAC verified) |
| GET | `/billing/status` | حالة |
| POST | `/billing/checkout` | إنشاء checkout |
| POST | `/billing/portal` | بوابة العميل |

### Tables / Reservations / QR
| GET/POST/PATCH/DELETE | `/tables` | CRUD |
| POST | `/tables/:id/free` / `/seat` | تحديث الحالة |
| GET/POST | `/reservations` | الحجوزات |
| GET/POST/PATCH/DELETE | `/qr` | إدارة رموز QR |

### Coupons / Discounts
| GET/POST/PATCH/DELETE | `/coupons` | CRUD |
| POST | `/coupons/validate` | تحقق |
| POST | `/coupons/:id/redeem` | استخدام |
| GET/PUT | `/discount-settings` | إعدادات الخصومات لكل دور |
| GET | `/discounts/config` | الإعداد الفعّال |
| POST | `/orders/:id/discount` | تطبيق خصم |

### Suppliers / Supplier orders
| GET/POST/PATCH/DELETE | `/suppliers` | CRUD |
| GET/POST/PATCH | `/supplier-orders` | أوامر الشراء |

### Webhooks / API Keys / Developer
| GET/POST/PATCH/DELETE | `/webhooks` | (Pro فقط) |
| GET/POST/PATCH/DELETE | `/developer/api-keys` | (Admin/Owner) |

### Tenants / Branches
| GET | `/tenants` | (platform_admin فقط) |
| GET | `/tenants/me` | المطعم الحالي |
| PATCH | `/tenants/me/settings` | إعدادات |
| GET/POST/PATCH/DELETE | `/branches` | CRUD |

### Uploads / Misc
| POST | `/uploads/image` | multipart, max 4MB |
| POST | `/uploads/image-base64` | base64 |
| GET | `/healthz` | health check |
| GET | `/events` | SSE realtime |
| GET | `/exchange-rates` | أسعار الصرف |
| GET | `/currencies` | قائمة العملات (166) |
| GET | `/openapi.json` / `/openapi.yaml` | مواصفات OpenAPI |
| GET | `/api/audit` | سجل التدقيق |

---

## 8. الواجهة الأمامية — الصفحات (44 صفحة)

### عامة (Public)
- `/order` — قائمة QR للعميل (Customer-facing) — تحتوي على:
  - مودال هوية العميل (اسم + جوال + سبب الاتصال) قبل أول طلب
  - مودال OTP عند `fraud_score ≥ 40`
  - عرض اختيار الـ Options (priceMode: full/delta)
  - Multilang (ar/en) + اختيار عملة
- `/sign-in`, `/sign-up`, `/landing` — صفحات تسجيل/تسجيل دخول/هبوط

### لوحة الإدارة (Protected — تحتاج JWT)
| المسار | الصفحة |
|--------|-------|
| `/` | POS الرئيسي — نقاط البيع |
| `/kitchen` | KDS — شاشة المطبخ |
| `/products` | إدارة المنتجات + Options |
| `/inventory` | المخزون |
| `/inventory/intelligence` | تحليلات المخزون (P3 — قريباً) |
| `/customers` | العملاء |
| `/customers/analytics` | تحليلات العملاء |
| `/suppliers` | الموردون |
| `/coupons` | الكوبونات |
| `/loyalty` | الولاء |
| `/staff` | الموظفون |
| `/staff-schedule` | جدولة الموظفين (P4 — قريباً) |
| `/branches` | الفروع |
| `/tables` | الطاولات |
| `/floor-plan` | مخطط الصالة |
| `/qr-menu` | إدارة QR Menu |
| `/qr-orders` | طلبات QR |
| `/cashier/shifts` | ورديات الكاشير |
| `/cashier/amendments` | تعديلات الطلبات (المسار موجود) |
| `/payments` | المدفوعات |
| `/reports` | التقارير اليومية |
| `/reports/advanced` | تقارير متقدمة (Pro) |
| `/financials` | المالية (P3 — قريباً) |
| `/financials/overview` | نظرة عامة مالية |
| `/notifications` | مركز الإشعارات |
| `/audit` | سجل التدقيق |
| `/security` | إعدادات الأمان (MFA + Master Password) |
| `/security/fraud` | **لوحة مراقبة الاحتيال** ⭐ |
| `/ai` | محادثة AI (P3 — قريباً) |
| `/billing` | الاشتراك والفواتير |
| `/settings` | الإعدادات العامة |
| `/settings/discounts` | إعدادات الخصومات |
| `/settings/invoice` | تخصيص الفاتورة |
| `/tenant/settings` | إعدادات المطعم |
| `/webhooks` | webhooks (P6 — قريباً) |
| `/developer` | API Keys (P6 — قريباً) |
| `/api-docs` | Swagger (P6 — قريباً) |

### مكونات مشتركة
- `layout.tsx` — Sidebar مجمّع في 4 أقسام: Sales / Customers & Staff / Operations / System
- `<Can perm="..."/>` — RBAC wrapper
- `<OptionPicker/>` — اختيار خيارات المنتج
- `<IdentityModal/>` + `<OtpModal/>` — لمسار QR

---

## 9. الميزات الكبرى تفصيلياً

### 9.1 نظام نقاط البيع (POS)
- إضافة منتجات للسلة بنقرة واحدة، تعديل الكمية، حذف.
- اختيار طاولة + نوع طلب (dine-in / takeaway / delivery).
- اختيار **Options** للمنتج (إذا كان لديه `option_groups`):
  - **Full price**: المقاس يستبدل السعر الأساسي (Small=20, Medium=30, Large=40)
  - **Delta price**: الإضافة تُضاف للسعر (Cheese=+5)
  - Single-select (مقاسات) / Multi-select (إضافات)
  - مجموعة مطلوبة → خطأ HTTP 400 بالعربي
- تخفيض حسب الدور + سبب إلزامي (مخزّن في `discount_logs`).
- إغلاق الفاتورة → طباعة (Bluetooth ESC/POS) + خصم تلقائي من المخزون.
- Web Push لإشعار "الطلب جاهز".

### 9.2 شاشة المطبخ (KDS)
- WebSocket: تذكرة تظهر فور إنشاء الطلب.
- تجميع حسب الطاولة.
- ملاحظات لكل بند (`order_items.item_note`).
- ملاحظة عامة على الطلب (`orders.general_note`).
- تعطيل المنتج مؤقتاً مع وقت إعادة تفعيل تلقائي (`unavailable_until` + Scheduler كل 30 ثانية).

### 9.3 قائمة QR للعميل
- العميل يمسح QR → يفتح `/order?token=...`.
- مسح يُسجَّل في `qr_scans` مع device fingerprint + IP + UA.
- اختيار لغة (ar/en) + عرض العملة المختارة من المطعم.
- يدخل اسمه وجواله (Saudi-only: `05XXXXXXXX` أو `+9665XXXXXXXX`).
- يضيف للسلة → ينقر "إرسال الطلب".
- يُحسب **fraud_score** (انظر القسم التالي).
- لو ≥40: OTP عبر WhatsApp (حالياً Stub — يُطبع في console الـ backend).
- لو ≥60: بعد OTP، ينتظر موافقة الكاشير.
- لو ≥80: يُرفض تلقائياً + يُحظر الجوال والجهاز 24 ساعة.

### 9.4 نظام مكافحة الاحتيال (7 طبقات)
**ثوابت الخطر** (في `qr-security.ts`):
- `RISK_OTP = 40`
- `RISK_APPROVAL = 60`
- `RISK_AUTO_BLOCK = 80`

**عوامل الخطر**:
1. ضرب على Blacklist → +100 (critical)
2. تاريخ احتيال للجهاز نفسه → +35
3. ساعة غير اعتيادية (3 ص - 6 ص) → +10
4. تكرار نفس QR من نفس الجهاز → +25
5. Farming (جهاز يستخدم رموز QR متعددة) → +25
6. سلوك الطلب: قيمة عالية > 500 ر.س → +15
7. عدد بنود > 20 → +15، اسم مفقود → +25
8. نفس الاسم من IP مختلفة عدة مرات → +25
9. تراكم طلبات غير مدفوعة → +15

**WhatsApp OTP** (stubbed):
- 6 أرقام عشوائية، صلاحية 10 دقائق، 5 محاولات قصوى.
- مفتاح فريد: `(phone, order_sec_id)`.

**عند الرفض من الكاشير**:
- حظر تلقائي لـ `phone` + `device_fingerprint` لمدة 7 أيام في `security_blacklist`.

### 9.5 الاشتراكات (Paddle SaaS)
- 3 خطط: **Starter** / **Pro** / **Enterprise**
- 14 يوماً تجريبي تلقائي.
- Webhook موقّع بـ HMAC (`/api/paddle/webhook`).
- وضع sandbox/mock بدون مفاتيح حقيقية.
- خاصية `tenants.demo_mode=TRUE` → تتجاوز كل الـ gating (للعروض التقديمية).
- `requirePlan("pro")` على الـ endpoints الاحترافية.

### 9.6 العملات المتعددة
- 166 عملة مدعومة، base = SAR.
- مصدر: Frankfurter API + open.er-api.com (مدمج).
- تحديث كل 24 ساعة + cache في `exchange_rates`.

### 9.7 i18n
- 25 لغة مسجلة (en + ar + 23 stub).
- Default RTL في العربية.
- `react-i18next` + ملفات `/i18n/locales/*.json`.

### 9.8 PWA + Offline
- Workbox Service Worker.
- Dexie.js (IndexedDB) لتخزين catalog محلياً.
- Replay queue: الطلبات تُحفظ محلياً عند الانقطاع وتُرسل تلقائياً عند رجوع الإنترنت.
- مؤشر اتصال أعلى الشاشة.

### 9.9 AI Chatbot
- Python sidecar على :9000.
- Claude Haiku 4.5 عبر `emergentintegrations` + `EMERGENT_LLM_KEY`.
- HTTP 402 عند نفاد الرصيد (`AI_BUDGET_EXCEEDED`).

### 9.10 WebSocket / Realtime
- `/ws` و `/api/ws` (لاجتياز K8s ingress).
- أحداث: `order:created`, `order:updated`, `kitchen:ready`, `product:auto_enabled`, ...
- Frontend يستقبل ويحدث الواجهة مباشرة.

### 9.11 SSE
- `/api/events` للأحداث الإدارية.
- Broker مركزي في `sse-broker.ts`.

### 9.12 Audit logging
- Middleware يلتقط كل POST/PUT/PATCH/DELETE تلقائياً.
- يحفظ في `audit_logs`: المستخدم + IP + method + path + sanitized body (يحجب `password`, `pin`, `token`, `secret`).
- استعراض في `/audit`.

### 9.13 Master Password + Protected Operations
- عمليات مثل "حذف منتج" / "تصفير وردية" / "تعديل طلب مغلق" تتطلب جلسة Master Password.
- bcrypt rounds=12.
- 8 backup codes single-use.
- جلسة محدودة (مثلاً 15 دقيقة).
- كل عملية تُسجَّل في `protected_operation_logs`.

---

## 10. بيانات الدخول التجريبية

```
URL:       https://d40ff25a-6729-4cca-ab4c-05bad06cdee1.preview.emergentagent.com
Email:     demo@foodpro.com
Password:  Demo2026!
```
- مطعم: **FoodPro Demo**
- خطة: **Enterprise / Active** (سنة كاملة)
- `demo_mode=TRUE` → كل الميزات مفتوحة

حساب آخر (المستخدم):
```
Email:     shakerup743@gmail.com
Password:  Demo2026!
```

---

## 11. الاختبارات والـ Tests

- `/app/backend/tests/test_foodpro_backend.py` — 36/36 ناجح.
- `/app/backend/tests/test_foodpro_iteration3.py` — Regression.
- `/app/backend/tests/test_fraud_protection.py` — 22/22 (Anti-Fraud).
- `iteration_7.json` — آخر تقرير اختبار (Anti-Fraud security hardening — passed).

**أداة الاختبار**: `testing_agent_v3_fork` يكتب تقارير في `/app/test_reports/`.

---

## 12. الموقّت والـ Jobs

- `/app/artifacts/api-server/src/jobs/availability-scheduler.ts`
  - يعمل كل 30 ثانية.
  - يفحص المنتجات المعطلة التي انتهى `unavailable_until` ويفعّلها تلقائياً.
  - يبث `product:auto_enabled` عبر SSE/WS.

---

## 13. ما هو Mocked / Stubbed

| الميزة | الحالة |
|--------|------|
| **Paddle billing** | sandbox + mock checkout URLs + webhook بدون توقيع. سيتم التفعيل بمفاتيح حقيقية. |
| **WhatsApp OTP** | يطبع الكود في `console.log` الـ backend. جاهز للربط بـ Twilio أو Meta Cloud API. |
| **CDN images** | حالياً يُخزّن في `/uploads` محلي. سيُنقل لـ Cloudflare R2 / AWS S3 لاحقاً. |
| **23 لغة من 25** | stub فقط (مفاتيح بدون ترجمة). |

---

## 14. Persistence والاستعادة التلقائية

- `/app/pgdata` يحتفظ ببيانات Postgres → ينجو من إعادة تشغيل الحاويات.
- `/app/scripts/bootstrap.sh` (supervisor priority=1):
  - ينشئ كل الجداول idempotent.
  - يضيف الأعمدة المفقودة (orders.kitchen_ready_at, items.item_note, products.image_url, ...).
  - يضع بذور 10 أدوار خصومات.
  - يضمن `demo_mode=TRUE` + Enterprise active للمطعم التجريبي.

> ⚠️ **ملاحظة**: جداول Anti-Fraud (`qr_scans`, `qr_order_security`, `whatsapp_otps`, `fraud_attempts`, `security_blacklist`) لم تُضف بعد إلى `bootstrap.sh`. ينبغي إضافتها لضمان الاستمرارية بعد إعادة تشغيل الحاوية.

---

## 15. ما تم إنجازه (Changelog مختصر)

### 2026-02-23 — Anti-Fraud + WhatsApp OTP
- 5 جداول جديدة، 7-layer risk scoring، WhatsApp OTP (stub)، لوحة مراقبة `/security/fraud`، Cashier approve/reject، Auto-blacklist.

### 2026-02-23 — Auth fix + Product Variants
- إصلاح Brute-force: `(email + IP)` بدل `IP-only`.
- Variants: `priceMode: full | delta`، POS + QR menu picker، Anti-tamper helper.

### 2026-02-21 — Investor demo sprint
- Product image upload + fallback.
- `/qr-orders` icon.
- `/settings/discounts` + `/settings/invoice` UI (live preview).
- Master Password verified (bcrypt 12 + 8 codes).
- Web Push notifications.
- RBAC wrappers + permission matrix.
- `demo_mode` override.
- Missing columns added.

### قبل ذلك
- 12-feature mega-spec كامل (QR + notes + images + discounts + invoice + PWA + master pw + RBAC + WS + reports + 25 lang + multi-currency).
- Restaurant signup (25 business types).
- AI Chat (Claude Haiku).
- 166 currency multi-currency.

---

## 16. خارطة الطريق (Next / Backlog)

### P0
1. ربط WhatsApp حقيقي (Twilio: `TWILIO_ACCOUNT_SID/AUTH_TOKEN/WHATSAPP_FROM`).
2. توحيد نموذج الضريبة: `/api/orders` inclusive (15/115) vs `/api/public/orders` exclusive (15%). اختر واحداً.

### P1
3. ربط خصم المخزون مع Option Groups (Family Size = SKU مختلف).
4. حساب الـ score **قبل** INSERT الطلب (حالياً يُنشأ ثم يُحذف عند الحظر).
5. **لوحة إحصائيات قائمة QR** — لغات وعملات العملاء (لاستهداف السياح). ← المهمة القادمة المطلوبة.
6. Cloudflare R2 / S3 لاستضافة صور المنتجات.

### P2
7. مفاتيح Paddle production (حالياً sandbox/mock).
8. ترجمة 23 لغة stub.
9. Web Push عبر VAPID (تذكير عبر الأجهزة).

### P3 / Future
10. تطبيقات جوال أصلية (React Native).
11. Reservations عبر QR.
12. AI image moderation للمنتجات.

---

## 17. كيف يُطوَّر النظام (Workflow للمطور القادم)

1. **قراءة هذه الوثيقة + `PRD.md`** أولاً.
2. **عدّل** `routes/*.ts` للـ backend.
3. **عدّل** `pages/*.tsx` للـ frontend.
4. **Build**:
   ```bash
   cd /app/artifacts/api-server && pnpm run build && sudo supervisorctl restart backend
   cd /app/artifacts/foodoro && pnpm run build && sudo supervisorctl restart frontend
   ```
5. **اختبر**: `testing_agent_v3_fork` للميزات الكبيرة، curl للصغيرة.
6. **حدّث** `PRD.md` و `test_credentials.md` عند تغيير حسابات/ميزات.

---

## 18. الملفات المرجعية الرئيسية

| الملف | الغرض |
|------|------|
| `/app/artifacts/api-server/src/routes/auth.ts` | تسجيل الدخول + Brute-force |
| `/app/artifacts/api-server/src/routes/public.ts` | QR public endpoints + Anti-Fraud admin |
| `/app/artifacts/api-server/src/lib/qr-security.ts` | Risk scoring + WhatsApp OTP |
| `/app/artifacts/api-server/src/lib/paddle.ts` | Paddle integration |
| `/app/artifacts/api-server/src/lib/ws.ts` | WebSocket broker |
| `/app/artifacts/foodoro/src/pages/order.tsx` | قائمة QR للعميل |
| `/app/artifacts/foodoro/src/pages/pos.tsx` | POS الرئيسي |
| `/app/artifacts/foodoro/src/pages/kitchen.tsx` | KDS |
| `/app/artifacts/foodoro/src/pages/fraud-monitoring.tsx` | لوحة الاحتيال |
| `/app/artifacts/foodoro/src/components/layout.tsx` | Layout + Sidebar |
| `/app/artifacts/foodoro/src/lib/device-fingerprint.ts` | بصمة الجهاز |
| `/app/lib/db/src/schema/*.ts` | Drizzle schemas |
| `/app/lib/db/src/migrations/*.sql` | SQL migrations |
| `/app/scripts/bootstrap.sh` | تهيئة DB + seeds |
| `/app/memory/PRD.md` | الـ PRD الأصلي |
| `/app/memory/test_credentials.md` | بيانات الدخول |

---

**نهاية الوثيقة.** ✅

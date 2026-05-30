# شرح عمل نظام Shaker 🔧

## 📋 نظرة عامة

Shaker هو نظام **Monorepo** متطور مبني على TypeScript مع خادم API قوي و WebSocket للتواصل الفوري.

---

## 🏗️ بنية المشروع

```
shaker/
├── artifacts/
│   ├── api-server/          # خادم API الرئيسي
│   │   ├── src/
│   │   │   ├── index.ts     # نقطة الدخول الرئيسية
│   │   │   ├── app.ts       # إعدادات Express
│   │   │   ├── routes/      # المسارات والواجهات
│   │   │   ├── lib/         # مكتبات مساعدة
│   │   │   └── middlewares/ # البرامج الوسيطة
│   │   └── package.json
│   └── api-zod/            # التحقق من صحة البيانات
├── lib/
│   └── api-spec/           # توثيق OpenAPI
├── scripts/                # سكريبتات مساعدة
└── package.json           # الملف الرئيسي

```

---

## 🚀 كيفية بدء التشغيل

### 1️⃣ التثبيت الأولي

```bash
# تثبيت المتعلقات
pnpm install

# بناء المشروع
pnpm run build
```

### 2️⃣ إعدادات البيئة (.env)

أنشئ ملف `.env` في `artifacts/api-server/`:

```env
# الخادم
PORT=3000
NODE_ENV=development

# قاعدة البيانات
DATABASE_URL=postgresql://user:password@localhost:5432/shaker_db

# المصادقة (Clerk)
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# الدفع (Stripe)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Paddle (بديل الدفع)
PADDLE_VENDOR_ID=xxxxx
PADDLE_API_KEY=xxxxx
```

### 3️⃣ تشغيل الخادم

```bash
cd artifacts/api-server

# وضع التطوير
pnpm run dev

# أو الإنتاج
pnpm run build && pnpm run start
```

---

## 🔄 تدفق عمل النظام

### 1. بدء التشغيل (`index.ts`)

```
┌─ تحميل متغيرات البيئة
├─ إنشاء خادم HTTP
├─ ربط WebSocket Broker
├─ تشغيل جدولة التوفر
└─ الاستماع على PORT
```

### 2. إعدادات Express (`app.ts`)

الخادم يستخدم Middleware بهذا الترتيب:

```
┌─ Helmet (الأمان)
├─ Logging (pino-http)
├─ Clerk Proxy (المصادقة)
├─ Stripe Webhook (الدفع - raw body)
├─ Paddle Webhook (الاشتراكات - raw body)
├─ خدمة الملفات (uploads)
├─ CORS (السماح بالطلبات العابرة)
├─ JSON Parser
├─ Cookie Parser
├─ Clerk Middleware (التحقق من المستخدمين)
├─ Rate Limiting (تحديد الطلبات)
├─ Swagger Docs
└─ المسارات الرئيسية
```

### 3. المميزات الرئيسية

| المميزة | الوصف | الحالة |
|---------|-------|--------|
| **Authentication** | مصادقة Clerk المتقدمة | ✅ مفعل |
| **WebSocket** | اتصال ثنائي الاتجاه فوري | ✅ مفعل |
| **Database** | PostgreSQL مع Drizzle ORM | ✅ مفعل |
| **Payments** | Stripe و Paddle | ✅ مفعل |
| **Rate Limiting** | حماية من الطلبات الكثيفة | ✅ مفعل |
| **Logging** | تسجيل مفصل مع Pino | ✅ مفعل |
| **API Documentation** | Swagger UI | ✅ متاح |

---

## 🔐 المصادقة والأمان

### Clerk Authentication

```
المستخدم → Clerk Widget
         ↓
   Clerk Proxy (/api/clerk/*)
         ↓
   التحقق والتوقيع (JWT)
         ↓
   Bearer Token في Headers
```

### JWT البديل

إذا لم يكن Clerk مفعلاً:

```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

Response: { "token": "jwt_token_here" }
```

---

## 💳 نظام الدفع

### Stripe Integration

```
Event (e.g., invoice.paid)
         ↓
Webhook → /api/billing/webhook
         ↓
التحقق من HMAC
         ↓
معالجة الدفع
```

### Paddle Integration

```
Event (e.g., subscription_created)
         ↓
Webhook → /api/paddle/webhook
         ↓
التحقق من HMAC
         ↓
معالجة الاشتراك
```

---

## 📡 WebSocket Communication

```typescript
// الخادم
socketBroker.attach(server)

// العميل
const socket = io('http://localhost:3000')
socket.on('message', (data) => { /* ... */ })
socket.emit('action', { /* ... */ })
```

### الأحداث المتاحة:
- `message` - رسالة عامة
- `user_update` - تحديث بيانات المستخدم
- `notification` - إشعار فوري

---

## 🗄️ قاعدة البيانات

### الاتصال

```typescript
DATABASE_URL=postgresql://user:password@host:5432/database

استخدام Drizzle ORM:
- تعريفات الجداول في db schema
- Migrations تلقائية
```

### الجدولة المجدولة

```
startAvailabilityScheduler()
         ↓
   فحص التوفر دورياً
         ↓
   تحديث قاعدة البيانات
```

---

## 📊 API Endpoints

### الوثائق التفاعلية

```
📍 http://localhost:3000/api/docs
```

### أمثلة على المسارات:

```bash
# المصادقة
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

# المستخدمين
GET    /api/users
GET    /api/users/:id
PUT    /api/users/:id

# الفواتير
GET    /api/billing/invoices
POST   /api/billing/subscribe

# الملفات
POST   /api/uploads
GET    /api/uploads/:filename
```

---

## 🐛 استكشاف الأخطاء

### الخادم لا يبدأ؟

```bash
# 1. تحقق من البيئة
echo $PORT  # يجب أن تكون موجودة

# 2. تحقق من الملفات
ls artifacts/api-server/.env

# 3. شاهد السجلات
pnpm run dev --verbose
```

### خطأ قاعدة البيانات؟

```bash
# تحقق من الاتصال
psql $DATABASE_URL

# شغّل الـ migrations
pnpm run db:migrate
```

### مشاكل الـ WebSocket؟

```bash
# تحقق من أن Socket.io يستمع
curl http://localhost:3000/socket.io/
```

---

## 📦 الحزم الأساسية

| الحزمة | الإصدار | الغرض |
|---------|---------|--------|
| **Express** | ^5 | الإطار الأساسي |
| **@clerk/express** | ^2.1 | المصادقة |
| **Drizzle ORM** | latest | ORM قوي |
| **Socket.io** | ^4.8 | WebSocket |
| **Stripe** | ^22.1 | معالجة الدفع |
| **Pino** | ^9 | Logging |
| **Helmet** | ^8 | الأمان |
| **Zod** | - | التحقق من البيانات |

---

## 🎯 الخطوات التالية

1. ✅ **الإعداد**: ملء متغيرات `.env`
2. ✅ **التثبيت**: `pnpm install`
3. ✅ **البناء**: `pnpm run build`
4. ✅ **التشغيل**: `pnpm run dev`
5. ✅ **الاختبار**: زيارة `http://localhost:3000/api/docs`

---

## 📞 الدعم والمساعدة

أي أسئلة؟ تواصل معي! 🚀

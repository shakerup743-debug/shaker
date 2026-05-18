# FOODORO — وثيقة النظام الكاملة

> نظام إدارة المطاعم — نقطة بيع + مطبخ + SaaS متعدد المستأجرين  
> الإصدار: 1.0 | التاريخ: مايو 2026

---

## الفهرس

1. [نظرة عامة على النظام](#1-نظرة-عامة-على-النظام)
2. [البنية التقنية](#2-البنية-التقنية)
3. [هيكل المشروع](#3-هيكل-المشروع)
4. [قاعدة البيانات — الجداول الكاملة](#4-قاعدة-البيانات--الجداول-الكاملة)
5. [نظام المصادقة والأمان](#5-نظام-المصادقة-والأمان)
6. [إدارة الأدوار والصلاحيات RBAC](#6-إدارة-الأدوار-والصلاحيات-rbac)
7. [واجهة برمجة التطبيقات API](#7-واجهة-برمجة-التطبيقات-api)
8. [صفحات الواجهة الأمامية Web](#8-صفحات-الواجهة-الأمامية-web)
9. [تطبيق الجوال Mobile](#9-تطبيق-الجوال-mobile)
10. [التحديثات الفورية SSE و WebSocket](#10-التحديثات-الفورية-sse-و-websocket)
11. [نظام تعدد المستأجرين Multi-Tenant](#11-نظام-تعدد-المستأجرين-multi-tenant)
12. [متغيرات البيئة والأسرار](#12-متغيرات-البيئة-والأسرار)
13. [تشغيل النظام وإدارة الـ Workflows](#13-تشغيل-النظام-وإدارة-الـ-workflows)
14. [خارطة طريق التطوير](#14-خارطة-طريق-التطوير)
15. [أفضل الممارسات والمحاذير](#15-أفضل-الممارسات-والمحاذير)

---

## 1. نظرة عامة على النظام

FOODORO هو نظام إدارة مطاعم متكامل يعمل كـ SaaS (برنامج كخدمة)، يتيح لكل مطعم إدارة عملياته اليومية بالكامل من خلال:

| المكوّن | الوصف |
|---------|--------|
| **نقطة البيع (POS)** | واجهة الكاشير لأخذ الطلبات، الفواتير، والمدفوعات |
| **نظام المطبخ (KDS)** | شاشة المطبخ لاستقبال التذاكر وتحديث حالاتها |
| **إدارة المخزون** | تتبع المواد الخام، التحذيرات، وسجلات الهدر |
| **التقارير والتحليلات** | KPIs، المبيعات اليومية/الشهرية، أفضل المنتجات |
| **إدارة العملاء والولاء** | قاعدة بيانات العملاء ونقاط المكافآت |
| **إدارة الموردين** | طلبات الشراء وتتبع التسليم |
| **QR Order** | طلب إلكتروني مباشر من الطاولة عبر رمز QR |
| **تطبيق الجوال** | للمديرين والموظفين لمتابعة العمليات من الهاتف |
| **Multi-Tenant** | عزل كامل للبيانات بين المطاعم المختلفة |

### الخصائص الرئيسية

- **ثنائي اللغة**: عربي (RTL) + إنجليزي (LTR) — يتبدّل في الوقت الفعلي
- **الوقت الفعلي**: تحديثات فورية بين الكاشير والمطبخ دون إعادة تحميل
- **آمن**: RBAC بـ 11 دور مختلف، RLS على قاعدة البيانات، وتدقيق كامل
- **SaaS جاهز**: كل مطعم مستأجر مستقل ببيانات معزولة تمامًا

---

## 2. البنية التقنية

```
┌─────────────────────────────────────────────────────────┐
│                     المستخدم النهائي                      │
└──────────┬──────────────────────────┬────────────────────┘
           │ متصفح الويب              │ تطبيق الجوال
           ▼                          ▼
┌──────────────────┐        ┌──────────────────────┐
│  React + Vite    │        │  Expo React Native   │
│  (port 24753)    │        │  (port متغير)        │
│  Clerk Auth      │        │  JWT Auth            │
│  Tailwind CSS    │        │  AsyncStorage        │
│  React Query     │        │  React Query         │
└────────┬─────────┘        └──────────┬───────────┘
         │                             │
         └──────────┬──────────────────┘
                    ▼
         ┌──────────────────────┐
         │  Reverse Proxy       │
         │  (localhost:80)      │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  Express 5 API       │
         │  (port 8080)         │
         │  Zod Validation      │
         │  Pino Logging        │
         │  Rate Limiting       │
         │  Helmet Security     │
         └──────────┬───────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │  PostgreSQL          │
         │  Drizzle ORM         │
         │  Row Level Security  │
         │  37 جدول             │
         └──────────────────────┘
```

### المكدس التقني الكامل

#### الواجهة الأمامية (Frontend)
| التقنية | الدور |
|---------|-------|
| React 18 | مكتبة الواجهة الأساسية |
| Vite 7 | أداة البناء والتطوير |
| Tailwind CSS | التصميم والأنماط |
| shadcn/ui | مكونات UI جاهزة |
| Wouter | التوجيه (Routing) |
| Framer Motion | الرسوم المتحركة |
| Recharts | الرسوم البيانية والتقارير |
| i18next | الترجمة AR/EN |
| TanStack Query | إدارة حالة السيرفر |
| Clerk | المصادقة (Web) |

#### الواجهة الخلفية (Backend)
| التقنية | الدور |
|---------|-------|
| Node.js 24 + Express 5 | سيرفر API |
| TypeScript (ESM) | لغة البرمجة |
| Drizzle ORM | التعامل مع قاعدة البيانات |
| PostgreSQL | قاعدة البيانات الرئيسية |
| jose (JWT) | توقين الجلسات |
| bcryptjs | تشفير كلمات المرور |
| Pino | نظام السجلات |
| Helmet | أمان الـ HTTP headers |
| express-rate-limit | تحديد معدل الطلبات |
| Zod | التحقق من صحة البيانات |

#### تطبيق الجوال
| التقنية | الدور |
|---------|-------|
| Expo SDK 54 | إطار التطوير |
| React Native 0.81 | مكتبة الجوال |
| expo-router | التنقل بين الشاشات |
| AsyncStorage | تخزين الجلسة محلياً |
| expo-haptics | ردود الفعل اللمسية |
| expo-blur | التأثيرات البصرية |

#### البنية التحتية والأدوات
| التقنية | الدور |
|---------|-------|
| pnpm workspaces | إدارة الـ Monorepo |
| Orval | توليد API hooks من OpenAPI |
| esbuild | تجميع سيرفر الإنتاج |
| Stripe | الفواتير والاشتراكات |

---

## 3. هيكل المشروع

```
workspace/
│
├── artifacts/                  # التطبيقات القابلة للنشر
│   ├── api-server/             # Express 5 REST API (port 8080)
│   │   └── src/
│   │       ├── app.ts          # إعداد Express + Clerk middleware
│   │       ├── index.ts        # نقطة البداية + WebSocket
│   │       ├── middleware/
│   │       │   ├── authenticate.ts   # التحقق من الهوية
│   │       │   ├── authorize.ts      # التحقق من الصلاحيات
│   │       │   └── require-tenant.ts # ربط الطلب بالمستأجر
│   │       ├── routes/
│   │       │   ├── index.ts    # تسجيل كل المسارات
│   │       │   ├── auth.ts     # تسجيل الدخول/الخروج
│   │       │   ├── orders.ts   # إدارة الطلبات
│   │       │   ├── kitchen.ts  # نظام المطبخ
│   │       │   ├── products.ts # المنتجات
│   │       │   ├── inventory.ts# المخزون
│   │       │   ├── reports.ts  # التقارير
│   │       │   ├── amendments.ts # تعديلات الفواتير
│   │       │   ├── cashier.ts  # وردية الكاشير
│   │       │   ├── tenants.ts  # إدارة المستأجرين
│   │       │   ├── users.ts    # إدارة المستخدمين
│   │       │   ├── security.ts # الأمان والجلسات
│   │       │   ├── customers.ts# العملاء
│   │       │   ├── suppliers.ts# الموردين
│   │       │   ├── waste.ts    # سجلات الهدر
│   │       │   └── sse.ts      # Server-Sent Events
│   │       └── lib/
│   │           ├── jwt.ts      # توقيع/تحقق JWT
│   │           ├── sse-broker.ts # موزع SSE
│   │           └── socket-broker.ts # WebSocket
│   │
│   ├── foodoro/                # React + Vite (port 24753)
│   │   └── src/
│   │       ├── App.tsx         # مزود Clerk + التوجيه
│   │       ├── pages/          # كل صفحات التطبيق (36 صفحة)
│   │       ├── components/     # المكونات المشتركة
│   │       │   ├── layout.tsx  # الهيكل العام + SSE
│   │       │   └── amendment-dialog.tsx
│   │       ├── hooks/          # React Hooks مخصصة
│   │       │   ├── use-sse.ts  # استقبال الأحداث الفورية
│   │       │   └── use-websocket.ts
│   │       └── i18n/
│   │           ├── locales/ar.json  # ترجمة عربية
│   │           └── locales/en.json  # ترجمة إنجليزية
│   │
│   └── foodoro-mobile/         # Expo React Native
│       ├── app/                # شاشات التطبيق
│       │   ├── _layout.tsx     # بوابة المصادقة
│       │   ├── login.tsx       # شاشة الدخول
│       │   └── (tabs)/         # التنقل الرئيسي
│       ├── contexts/auth.tsx   # إدارة JWT
│       └── hooks/useSse.ts     # SSE على الجوال
│
├── lib/                        # المكتبات المشتركة
│   ├── db/                     # Drizzle ORM
│   │   └── src/
│   │       ├── schema/         # تعريف الجداول (37 جدول)
│   │       └── migrations/     # ملفات RLS والـ migrations
│   ├── api-spec/               # OpenAPI 3.1 spec (مصدر الحقيقة)
│   │   └── openapi.yaml
│   ├── api-zod/                # Zod schemas مولّدة تلقائياً
│   └── api-client-react/       # React Query hooks مولّدة تلقائياً
│
└── scripts/                    # أدوات مساعدة
```

---

## 4. قاعدة البيانات — الجداول الكاملة

النظام يحتوي على **37 جدول** موزعة على 7 مجموعات وظيفية.

### 4.1 النظام والمستأجرون

#### جدول `tenants` — المطاعم المشتركة
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف الفريد |
| `slug` | text UNIQUE | الاسم المختصر (يُستخدم في URL) |
| `name` | text | اسم المطعم بالإنجليزي |
| `name_ar` | text | اسم المطعم بالعربي |
| `logo` | text | رابط الشعار |
| `primary_color` | text | اللون الرئيسي (افتراضي: `#E67E22`) |
| `currency` | text | العملة (افتراضي: `SAR`) |
| `tax_rate` | text | نسبة الضريبة (افتراضي: `15`) |
| `tax_inclusive` | boolean | هل الضريبة شاملة في السعر |
| `country` | text | الدولة (افتراضي: `SA`) |
| `timezone` | text | المنطقة الزمنية (افتراضي: `Asia/Riyadh`) |
| `subscription_plan` | text | خطة الاشتراك (starter/pro/enterprise) |
| `subscription_status` | text | حالة الاشتراك |
| `subscription_expires_at` | timestamp | تاريخ انتهاء الاشتراك |
| `stripe_customer_id` | text | معرّف العميل في Stripe |
| `stripe_subscription_id` | text | معرّف الاشتراك في Stripe |
| `settings` | jsonb | إعدادات مخصصة إضافية |
| `is_active` | boolean | هل المستأجر نشط |
| `created_at`, `updated_at` | timestamp | توقيتات الإنشاء والتحديث |

#### جدول `branches` — الفروع
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف |
| `tenant_id` | FK → tenants | المطعم المالك |
| `name` | text | اسم الفرع |
| `name_ar` | text | اسم الفرع بالعربي |
| `address` | text | العنوان |
| `city` | text | المدينة |
| `phone` | text | رقم الهاتف |
| `manager_id` | integer | معرّف مدير الفرع |
| `is_active` | boolean | نشط أم لا |
| `settings` | jsonb | إعدادات الفرع |

---

### 4.2 المستخدمون والأمان

#### جدول `users` — الموظفون
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف |
| `tenant_id` | integer | المطعم المنتمي إليه |
| `branch_id` | integer | الفرع |
| `name` | text NOT NULL | الاسم الكامل |
| `email` | text UNIQUE NOT NULL | البريد الإلكتروني |
| `password` | text | كلمة المرور (bcrypt) |
| `role` | text | الدور (cashier/admin/owner...) |
| `clerk_id` | text UNIQUE | معرّف Clerk (للويب) |
| `phone` | text | رقم الهاتف |
| `avatar` | text | صورة الملف الشخصي |
| `is_active` | boolean | نشط أم معلق |
| `pin` | text | رمز PIN للـ POS (6 أرقام) |
| `mfa_enabled` | boolean | هل المصادقة الثنائية مفعّلة |
| `mfa_secret` | text | سر TOTP المصادقة الثنائية |
| `mfa_secret_pending` | text | سر TOTP قيد الإعداد |
| `last_login_at` | timestamp | آخر تسجيل دخول |

#### جدول `user_sessions` — الجلسات
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف |
| `user_id` | integer NOT NULL | المستخدم |
| `user_name` | text | اسم المستخدم لحظة الدخول |
| `user_role` | text | الدور لحظة الدخول |
| `ip_address` | text | عنوان IP |
| `user_agent` | text | متصفح الجهاز |
| `device_fingerprint` | text | بصمة الجهاز |
| `session_token_hash` | text | هاش رمز الجلسة |
| `mfa_verified` | boolean | تم التحقق بالمصادقة الثنائية |
| `revoked` | boolean | هل تم إلغاء الجلسة |
| `last_active_at` | timestamp | آخر نشاط |

#### جدول `security_events` — أحداث الأمان
يسجل كل الأحداث الأمنية: محاولات الدخول الفاشلة، الحظر، الوصول المشبوه، تغيير كلمة المرور.
الحقول: `id`, `tenant_id`, `type`, `ip_address`, `user_id`, `user_name`, `metadata` (jsonb), `severity`, `resolved`, `created_at`

#### جدول `master_passwords` — كلمة المرور الرئيسية
كلمة مرور استثنائية لكل مستأجر تُستخدم للعمليات الحساسة (إلغاء تأمين الخصومات الكبيرة، الفواتير المعدّلة، إلخ).
الحقول: `id`, `tenant_id` (UNIQUE), `password_hash`, `backup_codes` (jsonb), `usage_count`, `last_used_at`

---

### 4.3 الكتالوج والمخزون

#### جدول `categories` — التصنيفات
| العمود | الوصف |
|--------|--------|
| `id` | المعرّف |
| `tenant_id` | المطعم |
| `name` | اسم التصنيف |
| `color` | اللون (hex) للتمييز البصري |

#### جدول `products` — المنتجات
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف |
| `tenant_id` | FK → tenants | المطعم |
| `name` | text NOT NULL | اسم المنتج |
| `description` | text | الوصف |
| `price` | numeric(10,2) | السعر |
| `is_active` | boolean | معروض في القائمة |
| `category_id` | integer | التصنيف |
| `image_url` | text | صورة المنتج |
| `kitchen_available` | boolean | متاح للطهي (لم ينفد) |
| `unavailability_reason` | text | سبب عدم التوفر |
| `unavailable_until` | timestamp | متوقف مؤقتاً حتى هذا الوقت |

#### جدول `inventory` — المخزون
| العمود | الوصف |
|--------|--------|
| `id` | المعرّف |
| `tenant_id` | المطعم |
| `name` | اسم المادة الخام |
| `quantity` | الكمية الحالية |
| `unit` | وحدة القياس (كغ، لتر، حبة) |
| `low_stock_threshold` | حد التحذير من انخفاض المخزون |
| `notes` | ملاحظات |

#### جدول `product_ingredients` — مكونات المنتج
يربط كل منتج بالمواد الخام التي يستهلكها:
| العمود | الوصف |
|--------|--------|
| `product_id` | المنتج |
| `inventory_id` | المادة الخام |
| `quantity_per_unit` | الكمية المستهلكة لكل وحدة مباعة |

#### جدول `waste_logs` — سجلات الهدر
| العمود | الوصف |
|--------|--------|
| `inventory_id` | المادة المهدرة |
| `inventory_name` | اسمها |
| `quantity` | الكمية |
| `unit` | الوحدة |
| `reason` | السبب (expired/damaged/spill/other) |
| `cost_estimate` | التكلفة التقديرية |
| `logged_by` | اسم من سجّل الهدر |

---

### 4.4 الطلبات والمطبخ

#### جدول `orders` — الطلبات
| العمود | النوع | الوصف |
|--------|-------|--------|
| `id` | serial PK | المعرّف |
| `tenant_id` | FK → tenants | المطعم |
| `customer_id` | FK → customers | العميل (اختياري) |
| `order_number` | text UNIQUE | رقم الطلب (مميّز) |
| `type` | text | نوع الطلب: dine_in / takeaway / delivery |
| `status` | text | الحالة: pending / preparing / ready / completed / cancelled |
| `subtotal` | numeric | المجموع قبل الضريبة |
| `discount` | numeric | قيمة الخصم |
| `tax` | numeric | قيمة الضريبة |
| `total` | numeric | الإجمالي النهائي |
| `payment_method` | text | طريقة الدفع: cash / card / wallet |
| `amount_paid` | numeric | المبلغ المدفوع |
| `change_amount` | numeric | الباقي |
| `table_number` | text | رقم الطاولة |
| `notes` | text | ملاحظات الطلب |
| `completion_token` | text | رمز إتمام الدفع (QR Orders) |
| `created_at` | timestamp | وقت الطلب |
| `completed_at` | timestamp | وقت الإتمام |

#### جدول `order_items` — عناصر الطلب
| العمود | الوصف |
|--------|--------|
| `order_id` | الطلب |
| `product_id` | المنتج |
| `product_name` | اسم المنتج (محفوظ للتاريخ) |
| `quantity` | الكمية |
| `unit_price` | سعر الوحدة |
| `subtotal` | المجموع الفرعي |
| `notes` | ملاحظات خاصة بالعنصر |

#### جدول `kitchen_tickets` — تذاكر المطبخ
| العمود | الوصف |
|--------|--------|
| `order_id` | UNIQUE FK → orders |
| `status` | الحالة: new / in_progress / ready / completed |
| `created_at`, `updated_at` | التوقيتات |

#### جدول `order_amendments` — تعديلات الفواتير
| العمود | الوصف |
|--------|--------|
| `order_id` | الطلب المعدَّل |
| `order_number` | رقم الفاتورة |
| `type` | نوع التعديل: discount / cancel_item / price_change / void |
| `reason` | السبب |
| `customer_name` | اسم العميل |
| `customer_phone` | هاتف العميل |
| `cashier_id` | الكاشير الذي أجرى التعديل |
| `cashier_name` | اسمه |
| `cashier_role` | دوره |
| `amount_before` | المبلغ قبل التعديل |
| `amount_after` | المبلغ بعد التعديل |
| `discount_amount` | قيمة الخصم |
| `printed` | هل طُبع التعديل |
| `printed_at` | وقت الطباعة |

---

### 4.5 العملاء والولاء

#### جدول `customers`
| العمود | الوصف |
|--------|--------|
| `id` | المعرّف |
| `name` | الاسم |
| `phone` | UNIQUE — رقم الهاتف |
| `email` | البريد الإلكتروني |
| `total_orders` | عدد الطلبات الكلي |
| `total_spent` | إجمالي الإنفاق |
| `loyalty_points` | نقاط الولاء |
| `loyalty_tier` | المستوى: bronze / silver / gold / platinum |

#### جدول `loyalty_transactions` — معاملات نقاط الولاء
| العمود | الوصف |
|--------|--------|
| `customer_id` | FK → customers |
| `points` | عدد النقاط |
| `type` | earn / redeem / adjust |
| `reason` | سبب المعاملة |
| `order_id` | الطلب المرتبط |

---

### 4.6 العمليات والإدارة

#### جدول `restaurant_tables` — الطاولات
| العمود | الوصف |
|--------|--------|
| `number` | رقم الطاولة (UNIQUE) |
| `capacity` | السعة (عدد الأشخاص) |
| `status` | الحالة: available / occupied / reserved |
| `pos_x`, `pos_y` | الموضع في خريطة الطابق |
| `shape` | الشكل: square / round / rectangle |
| `section` | القسم (داخلي / خارجي / VIP) |
| `current_order_id` | الطلب الحالي |
| `occupied_since` | وقت الاحتلال |
| `customer_name` | اسم الضيف |
| `guest_count` | عدد الضيوف |

#### جدول `qr_tokens` — رموز QR
| العمود | الوصف |
|--------|--------|
| `token` | UNIQUE — الرمز المشفّر |
| `tenant_id` | المطعم |
| `table_id` | FK → restaurant_tables |
| `is_active` | نشط أم لا |
| `scans_count` | عدد مرات المسح |
| `orders_count` | عدد الطلبات من هذا الرمز |
| `expires_at` | تاريخ الانتهاء |

#### جدول `cashier_shifts` — ورديات الكاشير
| العمود | الوصف |
|--------|--------|
| `user_id` | الكاشير |
| `started_at`, `ended_at` | بداية ونهاية الوردية |
| `order_count` | عدد الطلبات |
| `total_sales` | إجمالي المبيعات |
| `total_returns` | إجمالي المرتجعات |
| `total_discounts` | إجمالي الخصومات |
| `total_cancellations` | إجمالي الملغي |
| `is_closed` | مغلقة أم مفتوحة |

#### جدول `audit_logs` — سجل التدقيق
يسجل كل عملية حساسة في النظام (من فعل ماذا ومتى وبأي قيمة قديمة وجديدة).
الحقول: `user_id`, `user_name`, `user_role`, `action`, `resource`, `resource_id`, `old_value`, `new_value`, `ip_address`, `user_agent`

---

### 4.7 الموردون والـ Webhooks

#### جداول الموردين
- **`suppliers`**: بيانات المورد (الاسم، التواصل، شروط الدفع، التقييم)
- **`supplier_orders`**: طلبات الشراء من الموردين
- **`supplier_order_items`**: عناصر كل طلب شراء

#### جداول الـ Webhooks
- **`webhooks`**: تعريف نقاط الاستقبال الخارجية (URL، الأحداث المشترك بها، السر)
- **`webhook_logs`**: سجل إرسال كل webhook مع كود الاستجابة والمحتوى

---

## 5. نظام المصادقة والأمان

### 5.1 مسار مصادقة الويب (Clerk)

```
المستخدم يفتح التطبيق
        ↓
ClerkProvider يتحقق من الجلسة
        ↓
   مصادح؟ ─── لا ──→ صفحة /sign-in
        ↓ نعم
authenticate middleware
        ↓
getAuth(req) — يستخرج Clerk session
        ↓
resolveLocalUser — يبحث في DB بـ clerk_id
        ↓
  موجود في DB؟ ─── لا ──→ 401 (يجب إنشاء المستخدم أولاً)
        ↓ نعم
req.user = { sub: String(user.id), role, tenantId, ... }
        ↓
requireTenant middleware
        ↓
SET app.current_tenant_id في الـ pg session
        ↓
req.db = Drizzle instance مقيّد بالمستأجر
        ↓
تنفيذ المنطق التجاري
```

**ملاحظة مهمة**: لا يوجد JIT provisioning — يجب على الأدمن إنشاء المستخدم عبر `POST /api/users` قبل أول دخول له.

### 5.2 مسار مصادقة الجوال (JWT)

```
المستخدم يُدخل الإيميل + كلمة المرور
        ↓
POST /api/auth/login
        ↓
bcrypt.compare(password, hash)
        ↓
هل MFA مفعّل؟ ─── نعم ──→ طلب رمز TOTP
        ↓ لا
إنشاء user_session في DB
        ↓
jwt.sign({ sub, role, tenantId, sessionId })
        ↓
إرجاع { token, user }
        ↓
تخزين في AsyncStorage
        ↓
كل طلب: Authorization: Bearer <token>
        ↓
authenticate middleware يتحقق من التوقيع
        ↓
التحقق من أن الجلسة لم تُلغَ في DB
        ↓
req.user = { sub, role, tenantId, sessionId }
```

### 5.3 Middleware التحقق — authenticate.ts

```
طلب وارد
    ↓
هل يوجد Clerk session؟
    ├── نعم → resolveLocalUser(clerkId) → req.user
    └── لا → هل يوجد Authorization header؟
                ├── نعم → verifyToken(token)
                │         → تحقق من الجلسة في DB (revoked?)
                │         → req.user
                └── لا → 401
```

### 5.4 Security Features

| الميزة | التفاصيل |
|--------|----------|
| **Rate Limiting** | 20 طلب/15 دقيقة للمصادقة، 300 طلب/دقيقة للـ API |
| **Helmet** | حماية HTTP headers (HSTS, CSP, XSS, إلخ) |
| **MFA (TOTP)** | مصادقة ثنائية بتطبيقات Google/Authy |
| **Session Revocation** | إلغاء أي جلسة نشطة من لوحة الأمان |
| **Master Password** | كلمة مرور استثنائية للعمليات الحساسة |
| **Audit Log** | تتبع كل عملية بالمستخدم والوقت والقيم |
| **IP Blocking** | حظر عناوين IP المشبوهة |
| **PIN Lock** | رمز PIN للـ POS لتأمين الشاشة |

---

## 6. إدارة الأدوار والصلاحيات RBAC

### 6.1 الأدوار الـ 11

| الدور | النطاق | الصلاحيات |
|-------|--------|------------|
| `platform_admin` | عبر كل المستأجرين | `["*"]` — صلاحيات كاملة على النظام بأكمله |
| `owner` | داخل المستأجر | `["*"]` — صلاحيات كاملة على مطعمه |
| `admin` | داخل المستأجر | `["*"]` — صلاحيات كاملة على مطعمه |
| `area_manager` | متعدد الفروع | branches, reports, orders, staff, inventory, products, customers (قراءة/كتابة) |
| `branch_manager` | داخل الفرع | orders, products, inventory, staff, reports, customers, tables, kitchen, coupons |
| `cashier` | POS فقط | orders:read/write, products:read, categories:read, customers:read/write, tables:read/write |
| `waiter` | قاعة الطعام | orders:read/write, products:read, categories:read, tables:read/write, customers:read |
| `kitchen_staff` | المطبخ | kitchen:read/write, orders:read, products:read, inventory:read |
| `inventory_manager` | المخزون | inventory:read/write, products:read, suppliers:read/write, reports:read |
| `accountant` | المالية | reports:read, orders:read, inventory:read, suppliers:read, coupons:read |
| `hr` | الموارد البشرية | staff:read/write, reports:read |

### 6.2 الصلاحيات التفصيلية بالمسارات

#### إدارة النظام (platform_admin فقط)
- `GET/POST /api/tenants` — قائمة وإنشاء المطاعم
- `PATCH/DELETE /api/tenants/:id` — تعديل وحذف مطعم

#### إعدادات المستأجر والفروع
- `GET /api/tenants/me` — جميع المستخدمين المصادحين
- `PATCH /api/tenants/me` — owner, admin فقط
- `GET /api/branches` — owner, admin, area_manager, branch_manager
- `POST /api/branches` — owner, admin, area_manager
- `DELETE /api/branches/:id` — owner, admin

#### الموظفون
- `GET/POST/PATCH /api/users` — owner, admin فقط

#### الطلبات والـ POS
- `GET/POST /api/orders` — جميع الأدوار ما عدا hr و platform_admin
- `POST /api/orders/:id/complete` — owner, admin, branch_manager, cashier, waiter
- `GET/POST /api/categories` — جميع الأدوار المصادحة

#### المطبخ
- `GET /api/kitchen/tickets` — owner, admin, branch_manager, kitchen_staff
- `PATCH /api/kitchen/tickets/:id/status` — owner, admin, branch_manager, kitchen_staff
- `PATCH /api/kitchen/availability/:id` — owner, admin, branch_manager, kitchen_staff

#### المخزون
- `GET /api/inventory` — owner, admin, area_manager, branch_manager, inventory_manager, accountant, kitchen_staff
- `POST/PATCH /api/inventory` — owner, admin, branch_manager, inventory_manager

#### التقارير
- `GET /api/reports/dashboard` — كل الأدوار الإدارية
- `GET /api/reports/kpis` — يتطلب خطة Pro + owner/admin/area_manager/accountant

#### الأمان
- `GET /api/admin/audit-logs` — admin, owner
- `GET /api/security/settings` — owner, admin

---

## 7. واجهة برمجة التطبيقات API

### 7.1 القواعد العامة

- **Base URL**: `/api`
- **المصادقة**: `Authorization: Bearer <token>` أو Clerk session cookie
- **الترميز**: `Content-Type: application/json`
- **التحقق**: Zod schemas (من `@workspace/api-zod`)
- **السجلات**: Pino (`req.log` — لا `console.log`)

### 7.2 الطلبات العامة (Public)

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/healthz` | فحص صحة السيرفر — يُرجع `{ status: "ok" }` |
| POST | `/auth/login` | دخول بالإيميل وكلمة المرور — يُرجع JWT |
| POST | `/auth/logout` | تسجيل خروج وإلغاء الجلسة |
| GET | `/auth/me` | معلومات المستخدم الحالي |
| POST | `/auth/refresh` | تجديد الجلسة وإصدار JWT جديد |
| GET | `/events` | SSE stream للأحداث الفورية |
| GET | `/openapi.json` | مواصفات OpenAPI |

### 7.3 طلبات QR (عامة بلا مصادقة)

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/public/qr/:token` | التحقق من رمز QR وإرجاع معلومات الطاولة |
| GET | `/public/menu` | قائمة الطعام للضيوف |
| POST | `/public/orders` | إنشاء طلب من الطاولة |
| POST | `/public/orders/:id/complete` | إتمام الدفع بـ completion token |

### 7.4 التصنيفات والمنتجات

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/categories` | قائمة التصنيفات |
| POST | `/categories` | إنشاء تصنيف |
| PATCH | `/categories/:id` | تعديل تصنيف |
| DELETE | `/categories/:id` | حذف تصنيف |
| GET | `/products` | قائمة المنتجات (يدعم `?categoryId=&active=`) |
| POST | `/products` | إنشاء منتج |
| PUT | `/products/:id` | تحديث منتج |
| PATCH | `/products/:id/toggle` | تفعيل/إيقاف المنتج |
| DELETE | `/products/:id` | حذف منتج |
| GET | `/products/:id/ingredients` | مكونات المنتج |
| PUT | `/products/:id/ingredients` | تعيين مكونات المنتج |

### 7.5 إدارة الطلبات

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/orders` | قائمة الطلبات (يدعم `?status=&date=YYYY-MM-DD`) |
| POST | `/orders` | إنشاء طلب جديد |
| GET | `/orders/:id` | تفاصيل طلب محدد |
| PATCH | `/orders/:id` | تحديث حالة الطلب |
| POST | `/orders/:id/complete` | إتمام الطلب ومعالجة الدفع |

### 7.6 نظام المطبخ (KDS)

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/kitchen/tickets` | التذاكر النشطة |
| PATCH | `/kitchen/tickets/:id/status` | تحديث حالة التذكرة |
| GET | `/kitchen/availability` | قائمة المنتجات وتوفرها |
| PATCH | `/kitchen/availability/:id` | تغيير حالة توفر منتج |
| GET | `/kitchen/availability/log` | سجل تغييرات التوفر |

### 7.7 المخزون والهدر

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/inventory` | قائمة المخزون |
| POST | `/inventory` | إضافة مادة جديدة |
| PATCH | `/inventory/:id/adjust` | تعديل الكمية (+ / -) |
| GET | `/waste` | سجلات الهدر (يدعم `?from=&to=`) |
| POST | `/waste` | تسجيل هدر جديد |

### 7.8 التقارير والتحليلات

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/reports/dashboard` | KPIs اليوم الحالي |
| GET | `/reports/daily?date=YYYY-MM-DD` | ملخص مبيعات يوم محدد |
| GET | `/reports/hourly?date=YYYY-MM-DD` | توزيع المبيعات بالساعة |
| GET | `/reports/top-products?date=&limit=N` | أفضل المنتجات مبيعاً |
| GET | `/reports/by-category` | المبيعات مقسّمة على التصنيفات |
| GET | `/reports/kpis` | (Pro) مقارنة الفترات ومؤشرات متقدمة |
| GET | `/reports/monthly` | (Pro) تقرير شهري شامل |

### 7.9 العملاء والولاء

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/customers` | قائمة العملاء |
| POST | `/customers` | إضافة عميل |
| GET | `/customers/:id` | ملف عميل مع تاريخ الطلبات |
| PATCH | `/customers/:id` | تعديل بيانات العميل |
| GET | `/loyalty` | نقاط الولاء |

### 7.10 إدارة المستخدمين والأمان

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/users` | قائمة الموظفين (admin/owner) |
| POST | `/users` | إضافة موظف جديد |
| PATCH | `/users/:id` | تعديل بيانات موظف |
| GET | `/security/sessions` | جلسات المستخدمين النشطة |
| DELETE | `/security/sessions/:id` | إلغاء جلسة محددة |
| GET | `/admin/audit-logs` | سجل التدقيق |
| POST | `/security/firewall/block` | حظر IP |
| POST | `/master-password/verify` | التحقق من كلمة المرور الرئيسية |

### 7.11 الكاشير والورديات

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| POST | `/cashier/pin-login` | تحقق سريع من PIN |
| POST | `/cashier/verify-manager` | مصادقة مدير للعمليات الحساسة |
| GET | `/cashier/shifts/current` | الوردية الحالية |
| POST | `/cashier/shifts/start` | بدء وردية جديدة |
| POST | `/cashier/shifts/end` | إغلاق الوردية |
| GET | `/amendments` | تعديلات الفواتير |
| POST | `/amendments` | تسجيل تعديل فاتورة |
| PATCH | `/amendments/:id/print` | تسجيل طباعة التعديل |

### 7.12 الموردون

| الطريقة | المسار | الوصف |
|---------|--------|--------|
| GET | `/suppliers` | قائمة الموردين |
| POST | `/suppliers` | إضافة مورد |
| PATCH | `/suppliers/:id` | تعديل مورد |
| GET | `/suppliers/:id/orders` | طلبات الشراء من مورد |
| POST | `/supplier-orders` | إنشاء طلب شراء |

---

## 8. صفحات الواجهة الأمامية Web

التطبيق يحتوي على **36 صفحة** موزعة على 8 أقسام رئيسية. جميع الصفحات تتطلب تسجيل الدخول ما عدا `/sign-in`.

### 8.1 المصادقة والدخول

#### `/sign-in` — صفحة الدخول
- **تحكم**: Clerk (مُدار بالكامل)
- **خيارات**: Google OAuth + إيميل/كلمة مرور
- **التوجيه**: بعد الدخول → `/` (POS)
- **ملاحظة**: لا يوجد sign-up عام — يُنشئ الأدمن الحسابات

---

### 8.2 العمليات اليومية

#### `/` — نقطة البيع (POS)
**الغرض**: واجهة الكاشير الرئيسية لأخذ الطلبات

**الميزات**:
- تصفح المنتجات حسب التصنيف
- إضافة عناصر للسلة مع التعديل الكمي
- اختيار نوع الطلب (داخلي / خارج / توصيل)
- اختيار الطاولة
- اختيار العميل من القاعدة
- تطبيق الكوبونات والخصومات
- حساب الضريبة (15% VAT)
- معالجة الدفع (نقدي / بطاقة / محفظة)
- طباعة الفاتورة
- **Smart Lock**: يتطلب PIN للخصومات الكبيرة
- **Offline Queue**: تخزين الطلبات مؤقتاً عند انقطاع الإنترنت
- **تعديل الفاتورة**: `AmendmentDialog` للتعديلات بعد الإصدار

#### `/kitchen` — شاشة المطبخ (KDS)
**الغرض**: عرض وإدارة تذاكر الطلبات للطباخين

**الميزات**:
- بطاقات الطلبات مرتبة بالوقت (الأقدم أولاً)
- تحديث حالة التذكرة: New → In Progress → Ready
- إشعار فوري للكاشير عند جاهزية الطلب
- **AvailabilityPanel**: تسجيل نفاد منتج مع سبب وتوقيت
- **WastePanel**: تسجيل الهدر للمواد الخام

#### `/tables` — إدارة الطاولات
- عرض حالة كل طاولة (متاحة / مشغولة / محجوزة)
- تفاصيل الضيوف والطلب الحالي
- تغيير حالة الطاولة

#### `/floor-plan` — مخطط الطابق
- رسم بياني تفاعلي لمواضع الطاولات
- إدارة المقاعيد والأقسام

---

### 8.3 إدارة القائمة والمخزون

#### `/products` — المنتجات
- CRUD كامل للمنتجات
- ربط المنتجات بالتصنيفات
- رفع الصور
- تعيين المكونات وكمياتها
- تفعيل/إيقاف المنتجات

#### `/inventory` — المخزون
- قائمة المواد الخام مع الكميات
- تحذيرات المخزون المنخفض
- تعديل الكميات يدوياً
- تصفية حسب الحالة

#### `/suppliers` — الموردين
- إدارة قاعدة بيانات الموردين
- إنشاء طلبات الشراء
- تتبع حالة التسليم

#### `/coupons` — الكوبونات
- إنشاء أكواد خصم (نسبة مئوية / مبلغ ثابت)
- تحديد الصلاحية والحد الأقصى للاستخدام

---

### 8.4 التقارير والمالية

#### `/reports` — لوحة التقارير
**الغرض**: تحليل شامل للأداء

**الميزات**:
- KPI cards: إجمالي المبيعات، عدد الطلبات، متوسط الفاتورة
- رسم بياني للمبيعات (يومي/أسبوعي/شهري) — Recharts
- أفضل المنتجات مبيعاً
- توزيع المبيعات بالساعة
- تصفية بالتاريخ

#### `/reports/advanced` — تقارير متقدمة
- تحليل أعمق وتقارير مخصصة

#### `/financials` — الماليات (قادم)
- تقارير الربح والخسارة، تكلفة البضائع، هامش الربح

#### `/financials/overview` — نظرة مالية شاملة
- صحة الأعمال المالية على مستوى عالٍ

---

### 8.5 العملاء والموظفون

#### `/customers` — العملاء
- قاعدة بيانات العملاء
- تاريخ الطلبات والإنفاق
- نقاط الولاء والمستوى

#### `/customers/analytics` — تحليل العملاء
- سلوك العملاء وأنماط الشراء

#### `/staff` — الموظفون
- إدارة حسابات الموظفين
- تعيين الأدوار والصلاحيات
- تفعيل/إيقاف الحسابات

#### `/cashier/shifts` — ورديات الكاشير
- سجل ورديات الكاشيرين
- مطابقة المبالغ
- إحصائيات الوردية

#### `/cashier/amendments` — تعديلات الفواتير
- قائمة كل التعديلات مع هوية الكاشير
- فلترة بالنوع والتاريخ
- إعادة طباعة تعديل

#### `/staff-schedule` — جدول الموظفين (قادم)
---

### 8.6 الإعدادات والأمان

#### `/tenant/settings` — إعدادات المطعم
- تغيير الاسم والشعار
- إعداد الضريبة والعملة
- ساعات العمل

#### `/settings` — الإعدادات الشخصية
- الملف الشخصي، اللغة، الإشعارات

#### `/security` — مركز الأمان (admin/owner فقط)
- عرض الجلسات النشطة وإلغاؤها
- سجل الأحداث الأمنية
- إعداد MFA
- قواعد جدار الحماية

#### `/audit` — سجل التدقيق
- تاريخ كامل بكل العمليات (من، ماذا، متى)
- للمراجعة والمحاسبة

#### `/billing` — الفواتير والاشتراك
- مستوى الاشتراك الحالي
- ترقية الخطة عبر Stripe
- تاريخ المدفوعات

---

### 8.7 صفحات "قادم قريباً"

| المسار | الميزة |
|--------|--------|
| `/ai` | تحليلات ذكاء اصطناعي |
| `/inventory/intelligence` | تنبؤ ذكي بالمخزون |
| `/loyalty` | برنامج الولاء المتقدم |
| `/notifications` | مركز الإشعارات |
| `/qr-menu` | إدارة قائمة QR |
| `/developer` | منصة المطورين |
| `/api-docs` | توثيق Swagger |
| `/webhooks` | إدارة Webhooks |

---

## 9. تطبيق الجوال Mobile

### 9.1 الشاشات الرئيسية

#### بوابة المصادقة — `app/_layout.tsx`
- يتحقق من وجود JWT في AsyncStorage
- مصادح → يُحوّل لـ `(tabs)/`
- غير مصادح → يُحوّل لـ `/login`

#### `/login` — الدخول
- إيميل + كلمة مرور
- POST `/api/auth/login` → JWT
- تخزين في AsyncStorage

#### التبويبات الرئيسية `(tabs)/`

| التبويب | الملف | الوصف |
|---------|-------|--------|
| **الرئيسية** | `index.tsx` | نظرة عامة سريعة |
| **لوحة البيانات** | `dashboard.tsx` | KPIs: المبيعات، الطلبات، المطبخ، المخزون المنخفض |
| **الطلبات** | `orders.tsx` | قائمة بحث وفلترة (pending/preparing/ready/completed) |
| **المطبخ** | `kitchen.tsx` | KDS موبايل — تحديث التذاكر مع haptics |
| **التحليلات** | `analytics.tsx` | P&L، إجمالي الإيرادات، أفضل المنتجات |
| **الملف الشخصي** | `profile.tsx` | إعدادات المستخدم + تسجيل الخروج |

#### شاشة التفاصيل
- **`/order/[id]`**: تفاصيل طلب: العناصر، الضريبة، الخصومات، طريقة الدفع

### 9.2 الاتصال بالـ API

```typescript
// إعداد Base URL
const BASE_URL = `https://${EXPO_PUBLIC_DOMAIN}`;

// إضافة JWT لكل طلب
setAuthTokenGetter(() => AsyncStorage.getItem("jwt_token"));

// استخدام React Query hooks المولّدة
const { data } = useGetDashboardStats();
const { data } = useListOrders({ status: "pending" });
```

### 9.3 SSE على الجوال

الجوال يستخدم XHR streaming بدلاً من `EventSource` الأصلي (أكثر موثوقية على iOS/Android):

```typescript
// hooks/useSse.ts
// iOS/Android: XHR streaming parser
// Web: native EventSource
// مع إعادة الاتصال التلقائي عند الانقطاع
```

### 9.4 الخصائص البصرية

| الميزة | التقنية |
|--------|---------|
| ردود فعل لمسية | `expo-haptics` |
| تأثيرات ضبابية | `expo-blur` + `expo-glass-effect` |
| أيقونات iOS أصلية | `expo-symbols` (Android: `Feather`) |
| Dark/Light mode | `useColors()` hook |
| ألوان الهوية | Royal Orange `#E67E22` |

---

## 10. التحديثات الفورية SSE و WebSocket

### 10.1 بنية SSE

```
حدث في السيرفر (طلب جديد / تغيير تذكرة / نفاد مخزون)
        ↓
sseBroker.emit({ event, data })
        ↓
SseBroker يُرسل للـ Set من Response objects
        ↓
"event: order:created\ndata: {...}\n\n"
        ↓
EventSource في المتصفح / XHR في الجوال
        ↓
useSse() hook يستقبل الحدث
        ↓
SseNotificationSync يُشغّل:
  1. toast notification (صوت + رسالة)
  2. queryClient.invalidateQueries(["/api/orders"])
        ↓
React Query يُعيد الجلب تلقائياً
        ↓
الواجهة تتحدث دون إعادة تحميل
```

### 10.2 جدول الأحداث الكاملة

| الحدث | المصدر | التأثير |
|-------|--------|---------|
| `order:created` | POST /orders | المطبخ يرى الطلب الجديد فوراً |
| `ticket:updated` | PATCH /kitchen/tickets/:id/status | الكاشير يعرف أن الطلب جاهز |
| `inventory:low` | إتمام طلب | تحذير في لوحة المخزون |
| `ingredient:out_of_stock` | الكمية تصل صفر | إيقاف المنتجات المرتبطة تلقائياً |
| `product:unavailable` | المطبخ يُوقف منتجاً | POS وقائمة QR لا تعرضانه |
| `product:available` | المطبخ يُعيد تفعيل منتج | يظهر مرة أخرى في POS |
| `product:auto_enabled` | Scheduler (كل 30 ثانية) | يُعيد تفعيل المنتجات بعد انتهاء فترة snooze |
| `stats:updated` | إتمام طلب | لوحة التقارير تتحدث |

### 10.3 WebSocket (بنية تحتية)

يعمل بجانب SSE على `/ws`:
- يدعم `join/leave` rooms حسب `tenantId` و `branchId`
- يُستخدم للبث المُستهدف مستقبلاً
- حالياً SSE هو المُستخدم للمنطق التجاري الرئيسي

### 10.4 Heartbeat

السيرفر يُرسل `ping` كل 25 ثانية لإبقاء الاتصال حياً عبر proxies.

---

## 11. نظام تعدد المستأجرين Multi-Tenant

### 11.1 نموذج العزل

```
                  ┌─────────────────┐
                  │  FOODORO Platform│
                  └────────┬────────┘
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │ مطعم A      │  │ مطعم B      │  │ مطعم C      │
   │ tenant_id=1 │  │ tenant_id=2 │  │ tenant_id=3 │
   └─────────────┘  └─────────────┘  └─────────────┘
          │
   ┌──────▼──────────────────────────────────────┐
   │  نفس قاعدة البيانات — بيانات معزولة بـ RLS  │
   └─────────────────────────────────────────────┘
```

### 11.2 آلية العزل

**3 طبقات حماية متداخلة:**

**الطبقة 1: Middleware**
```typescript
// require-tenant.ts
const client = await pool.connect();
await client.query(`SET app.current_tenant_id = '${tenantId}'`);
req.db = createTenantDb(client); // Drizzle مقيّد بهذا الـ client
```

**الطبقة 2: Application**
```typescript
// كل query تُضيف فلتر tenant_id
db.select().from(orders).where(eq(orders.tenantId, req.tenantId))
```

**الطبقة 3: Database RLS**
```sql
-- حتى لو نسي المطور الفلتر، PostgreSQL يُطبّقه
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());
```

### 11.3 تحديد المستأجر لكل طلب

```
طلب وارد مع auth
        ↓
req.user.tenantId موجود في JWT؟
    ├── نعم → استخدامه مباشرة
    └── لا  → البحث في DB
                ├── هل sub رقمي؟ → البحث بـ users.id
                └── لا → البحث بـ users.clerk_id
        ↓
tenantId محدد → SET app.current_tenant_id
        ↓
عند انتهاء الطلب → RESET app.current_tenant_id
```

### 11.4 الجداول المعزولة

الجداول التي تطبّق عليها RLS:
- `categories`, `products`, `orders`, `kitchen_tickets`, `inventory`

الجداول المشتركة (بدون tenant_id حتى الآن):
- `customers`, `coupons`, `restaurant_tables`, `suppliers`

*(سيتم عزلها في المهام #28, #29, #30)*

### 11.5 تفعيل RLS (تُنفَّذ مرة واحدة)

```bash
# إضافة أعمدة tenant_id على الجداول الأساسية
psql "$DATABASE_URL" -f lib/db/src/migrations/add-tenant-id-to-core-tables.sql

# تفعيل FORCE RLS وإنشاء السياسات
psql "$DATABASE_URL" -f lib/db/src/migrations/rls-tenant-isolation.sql
```

---

## 12. متغيرات البيئة والأسرار

### 12.1 متغيرات مطلوبة

| المتغير | الوصف | من أين |
|---------|--------|--------|
| `DATABASE_URL` | سلسلة اتصال PostgreSQL | Replit (تلقائي) |
| `JWT_SECRET` | ≥32 حرف لتوقيع JWT | Replit Secrets |
| `PORT` | منفذ السيرفر | Replit Workflow (تلقائي) |
| `NODE_ENV` | development / production | Replit (تلقائي) |
| `CLERK_SECRET_KEY` | مفتاح Clerk السري | Replit Secrets |
| `CLERK_PUBLISHABLE_KEY` | مفتاح Clerk العام | Replit Secrets |
| `VITE_CLERK_PUBLISHABLE_KEY` | مفتاح Clerk للـ Vite | Replit Secrets |

### 12.2 متغيرات اختيارية

| المتغير | الوصف |
|---------|--------|
| `STRIPE_SECRET_KEY` | مفتاح Stripe للفواتير |
| `STRIPE_WEBHOOK_SECRET` | سر التحقق من Stripe webhooks |
| `VITE_STRIPE_PUBLISHABLE_KEY` | مفتاح Stripe للواجهة |

### 12.3 متغيرات الموبايل (Expo)

| المتغير | الوصف |
|---------|--------|
| `EXPO_PUBLIC_DOMAIN` | دومين الـ API |
| `EXPO_PUBLIC_REPL_ID` | معرّف Replit |
| `REPLIT_EXPO_DEV_DOMAIN` | دومين تطوير Expo |

---

## 13. تشغيل النظام وإدارة الـ Workflows

### 13.1 الـ Workflows النشطة

| الخدمة | الأمر | المنفذ |
|--------|-------|--------|
| API Server | `pnpm --filter @workspace/api-server run dev` | 8080 |
| Web Frontend | `pnpm --filter @workspace/foodoro run dev` | 24753 |
| Mobile (Expo) | `pnpm --filter @workspace/foodoro-mobile run dev` | متغير |
| Mockup Sandbox | `pnpm --filter @workspace/mockup-sandbox run dev` | 8081+ |

### 13.2 أوامر التطوير

```bash
# فحص TypeScript على كل الحزم
pnpm run typecheck

# دفع تغييرات قاعدة البيانات
pnpm --filter @workspace/db run push

# إعادة توليد API hooks من OpenAPI
pnpm --filter @workspace/api-spec run codegen

# فحص TypeScript على حزمة واحدة
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/foodoro run typecheck
```

### 13.3 التوجيه عبر Reverse Proxy

```
localhost:80/api/*     → api-server (port 8080)
localhost:80/*         → foodoro (port 24753)
```

**مهم**: عند اختبار API من الـ shell، استخدم `localhost:80/api/` وليس `localhost:8080/api/` مباشرة.

### 13.4 تدفق النشر (Production)

```bash
# 1. رفع الكود لـ Replit
# 2. اضغط Publish في واجهة Replit
# 3. يتم تلقائياً:
#    - pnpm run build (esbuild للسيرفر)
#    - vite build (للواجهة)
#    - نشر على .replit.app
```

---

## 14. خارطة طريق التطوير

### المرحلة الأولى — مكتملة ✅
- ✅ CRUD REST API كامل
- ✅ JWT auth + RBAC
- ✅ Real-time SSE
- ✅ Security middleware
- ✅ ثنائي اللغة AR/EN + RTL
- ✅ Multi-tenant مع RLS
- ✅ Clerk integration للويب
- ✅ تطبيق جوال Expo
- ✅ Stripe billing
- ✅ قاعدة بيانات 37 جدول

### المرحلة الثانية — قريباً
- ⬜ تدوير Refresh tokens (Redis)
- ⬜ ترقية WebSocket للاتصال ثنائي الاتجاه
- ⬜ PWA / Service Worker للعمل دون إنترنت
- ⬜ طباعة الفواتير (Thermal Printer via Web USB)
- ⬜ خصم المخزون تلقائياً عند إتمام الطلب

### المرحلة الثالثة — SaaS متقدم
- ⬜ AI Analytics: تحليل ذكي للمبيعات والاتجاهات
- ⬜ تنبؤ ذكي بالمخزون
- ⬜ توجيه Subdomain: `{slug}.foodoro.app`
- ⬜ بوابة إدارة المستأجرين
- ⬜ قاعدة بيانات معزولة لكل مستأجر (enterprise)

### المرحلة الرابعة — مؤسسي
- ⬜ Redis caching للقائمة والتقارير
- ⬜ BullMQ لمهام الخلفية
- ⬜ S3/R2 لصور المنتجات
- ⬜ تحليلات متقدمة (P&L، تكلفة الغذاء)
- ⬜ دعم متعدد الفروع بشكل كامل

---

## 15. أفضل الممارسات والمحاذير

### 15.1 قواعد لا تكسرها

| القاعدة | السبب |
|---------|--------|
| لا `console.log` في السيرفر | استخدم `req.log` أو `logger` من Pino |
| لا `import zod` مباشرة في api-server | استخدم `@workspace/api-zod` فقط |
| لا `pnpm dev` من الجذر | استخدم الـ workflows أو `--filter` |
| لا تعديل الملفات المولّدة | غيّر `openapi.yaml` ثم شغّل `codegen` |
| بعد إضافة جدول جديد | شغّل `db push` ثم أضفه لملفات RLS |

### 15.2 RTL / LTR

```tsx
// استخدم border-s/border-e بدلاً من border-l/border-r
<div className="border-s-2"> // ✅ RTL-safe
<div className="border-l-2"> // ❌
```

### 15.3 إضافة مستخدم جديد

```
1. الأدمن يستخدم POST /api/users لإنشاء المستخدم
2. المستخدم يسجّل دخوله عبر Clerk بنفس الإيميل
3. authenticate middleware يربط clerk_id بالمستخدم
4. لا يوجد تسجيل ذاتي (حماية من وصول غير مصرح)
```

### 15.4 تعدد المستأجرين — نقاط مهمة

- **لا تشارك pg.PoolClient** بين طلبين مختلفين
- **RESET مهم**: النسيان يُسرّب بيانات مستأجر لآخر
- **tenant_id في كل insert**: حتى مع RLS كطبقة خلفية
- **platform_admin** لا يحصل عليه أي مستخدم مطعم

### 15.5 الأمان العام

- JWT مخزّن في localStorage (مناسب للـ POS tablets)
- مدة الـ Token: 24 ساعة
- Rate limiting: 20 طلب/15 دقيقة للمصادقة
- كل العمليات الحساسة تُسجَّل في audit_log
- Session revocation فوري (التحقق من DB في كل طلب)

---

## ملاحق

### أ. هيكل رمز الطلب

```
ORD-{timestamp}-{random}
مثال: ORD-1716890000-A3X7
```

### ب. حسابات الضريبة

```
subtotal = Σ (quantity × unit_price) - discount
tax = subtotal × (tax_rate / 100)  [15% افتراضياً]
total = subtotal + tax
```

### ج. مستويات نقاط الولاء

| المستوى | النقاط |
|---------|--------|
| Bronze | 0 - 499 |
| Silver | 500 - 1999 |
| Gold | 2000 - 9999 |
| Platinum | 10000+ |

### د. حالات الطلب

```
pending → preparing → ready → completed
    ↘
    cancelled (من أي حالة قبل completed)
```

### هـ. حالات تذكرة المطبخ

```
new → in_progress → ready → completed
```

---

*وثيقة مُولَّدة آلياً من الكود الفعلي للنظام — مايو 2026*

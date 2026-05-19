import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Code2, ChevronDown, Copy, CheckCheck, Globe, Lock, Tag, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  summary: string;
  summaryAr: string;
  auth: boolean;
  roles?: string[];
  tags: string[];
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  POST:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PUT:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  PATCH:  "bg-purple-500/10 text-purple-400 border-purple-500/20",
  DELETE: "bg-red-500/10 text-red-400 border-red-500/20",
};

const ENDPOINTS: ApiEndpoint[] = [
  // Auth
  { method: "POST", path: "/api/auth/login", summary: "Login with email + password", summaryAr: "تسجيل الدخول بالبريد وكلمة المرور", auth: false, tags: ["Auth"], request: { email: "string", password: "string" }, response: { token: "string", user: {} } },
  { method: "GET",  path: "/api/auth/me",    summary: "Get current authenticated user", summaryAr: "الحصول على المستخدم الحالي", auth: true, tags: ["Auth"], response: { id: 1, name: "string", role: "string" } },
  // Categories
  { method: "GET",    path: "/api/categories",    summary: "List all categories",     summaryAr: "قائمة الأصناف",           auth: true, tags: ["Menu"] },
  { method: "POST",   path: "/api/categories",    summary: "Create category",         summaryAr: "إنشاء صنف",              auth: true, tags: ["Menu"], roles: ["admin","owner"], request: { name: "string", nameAr: "string", color: "#hex", icon: "string" } },
  { method: "PUT",    path: "/api/categories/:id", summary: "Update category",        summaryAr: "تعديل صنف",              auth: true, tags: ["Menu"], roles: ["admin","owner"] },
  { method: "DELETE", path: "/api/categories/:id", summary: "Delete category",        summaryAr: "حذف صنف",                auth: true, tags: ["Menu"], roles: ["admin","owner"] },
  // Products
  { method: "GET",    path: "/api/products",      summary: "List all products",       summaryAr: "قائمة المنتجات",          auth: true, tags: ["Menu"] },
  { method: "POST",   path: "/api/products",      summary: "Create product",          summaryAr: "إنشاء منتج",             auth: true, tags: ["Menu"], roles: ["admin","owner"] },
  { method: "PUT",    path: "/api/products/:id",  summary: "Update product",          summaryAr: "تعديل منتج",             auth: true, tags: ["Menu"], roles: ["admin","owner"] },
  { method: "PATCH",  path: "/api/products/:id/toggle", summary: "Toggle availability", summaryAr: "تبديل التوفر",        auth: true, tags: ["Menu"] },
  { method: "DELETE", path: "/api/products/:id",  summary: "Delete product",          summaryAr: "حذف منتج",               auth: true, tags: ["Menu"], roles: ["admin","owner"] },
  // Orders
  { method: "GET",  path: "/api/orders",         summary: "List orders",              summaryAr: "قائمة الطلبات",           auth: true, tags: ["Orders"] },
  { method: "POST", path: "/api/orders",         summary: "Create order (POS)",       summaryAr: "إنشاء طلب",              auth: true, tags: ["Orders"], request: { type: "dine_in|takeaway|delivery", items: [], tableNumber: "string?" } },
  { method: "GET",  path: "/api/orders/:id",     summary: "Get order by ID",          summaryAr: "الحصول على طلب محدد",    auth: true, tags: ["Orders"] },
  { method: "PATCH",path: "/api/orders/:id",     summary: "Update order status",      summaryAr: "تحديث حالة الطلب",      auth: true, tags: ["Orders"] },
  // Kitchen
  { method: "GET",   path: "/api/kitchen/tickets",           summary: "List kitchen tickets", summaryAr: "تذاكر المطبخ",  auth: true, tags: ["Kitchen"] },
  { method: "PATCH", path: "/api/kitchen/tickets/:id/status", summary: "Update ticket status", summaryAr: "تحديث حالة التذكرة", auth: true, tags: ["Kitchen"], request: { status: "pending|preparing|ready|served" } },
  // Inventory
  { method: "GET",   path: "/api/inventory",         summary: "List inventory items",  summaryAr: "قائمة المخزون",        auth: true, tags: ["Inventory"] },
  { method: "POST",  path: "/api/inventory",         summary: "Add inventory item",    summaryAr: "إضافة عنصر مخزون",    auth: true, tags: ["Inventory"] },
  { method: "PATCH", path: "/api/inventory/:id/adjust", summary: "Adjust stock level", summaryAr: "تعديل مستوى المخزون", auth: true, tags: ["Inventory"] },
  // Reports
  { method: "GET", path: "/api/reports/dashboard",            summary: "Dashboard KPIs",    summaryAr: "مؤشرات الأداء", auth: true, tags: ["Reports"] },
  { method: "GET", path: "/api/reports/daily?date=YYYY-MM-DD", summary: "Daily sales",      summaryAr: "مبيعات اليوم",  auth: true, tags: ["Reports"] },
  { method: "GET", path: "/api/reports/hourly?date=YYYY-MM-DD", summary: "Hourly breakdown", summaryAr: "توزيع بالساعة", auth: true, tags: ["Reports"] },
  { method: "GET", path: "/api/reports/top-products",          summary: "Top selling products", summaryAr: "أكثر المنتجات مبيعاً", auth: true, tags: ["Reports"] },
  // Customers
  { method: "GET",   path: "/api/customers",     summary: "List customers (CRM)",  summaryAr: "قائمة العملاء",    auth: true, tags: ["CRM"] },
  { method: "POST",  path: "/api/customers",     summary: "Create customer",       summaryAr: "إنشاء عميل",      auth: true, tags: ["CRM"] },
  { method: "PATCH", path: "/api/customers/:id", summary: "Update customer",       summaryAr: "تعديل عميل",      auth: true, tags: ["CRM"] },
  // Loyalty
  { method: "GET",  path: "/api/loyalty/leaderboard",       summary: "Loyalty leaderboard", summaryAr: "لوحة الولاء",           auth: true, tags: ["Loyalty"] },
  { method: "GET",  path: "/api/loyalty/:id/history",       summary: "Points history",      summaryAr: "سجل النقاط",            auth: true, tags: ["Loyalty"] },
  { method: "POST", path: "/api/loyalty/:id/award",         summary: "Award loyalty points", summaryAr: "منح نقاط الولاء",      auth: true, tags: ["Loyalty"], request: { points: 100, reason: "string" } },
  { method: "POST", path: "/api/loyalty/:id/redeem",        summary: "Redeem points",        summaryAr: "استرداد النقاط",       auth: true, tags: ["Loyalty"], request: { points: 100 } },
  // Developer
  { method: "GET",    path: "/api/developer/api-keys",     summary: "List API keys",    summaryAr: "قائمة مفاتيح API", auth: true, tags: ["Developer"], roles: ["admin","owner"] },
  { method: "POST",   path: "/api/developer/api-keys",     summary: "Create API key",   summaryAr: "إنشاء مفتاح API",  auth: true, tags: ["Developer"], roles: ["admin","owner"] },
  { method: "DELETE", path: "/api/developer/api-keys/:id", summary: "Revoke API key",   summaryAr: "إلغاء مفتاح API",  auth: true, tags: ["Developer"], roles: ["admin","owner"] },
  // Audit
  { method: "GET", path: "/api/audit",         summary: "Audit log entries",   summaryAr: "سجلات التدقيق",   auth: true, tags: ["Security"], roles: ["admin","owner"] },
  { method: "GET", path: "/api/audit/actions", summary: "Distinct action types", summaryAr: "أنواع الأحداث", auth: true, tags: ["Security"], roles: ["admin","owner"] },
  // Users
  { method: "GET",   path: "/api/users",     summary: "List users (admin)",   summaryAr: "قائمة المستخدمين",   auth: true, tags: ["Users"], roles: ["admin","owner"] },
  { method: "POST",  path: "/api/users",     summary: "Create user",          summaryAr: "إنشاء مستخدم",      auth: true, tags: ["Users"], roles: ["admin","owner"] },
  { method: "PATCH", path: "/api/users/:id", summary: "Update user",          summaryAr: "تعديل مستخدم",      auth: true, tags: ["Users"], roles: ["admin","owner"] },
  // SSE
  { method: "GET", path: "/api/events", summary: "Server-Sent Events stream", summaryAr: "تدفق الأحداث اللحظية", auth: true, tags: ["Real-time"] },
  { method: "GET", path: "/ws",         summary: "WebSocket connection",       summaryAr: "اتصال WebSocket",      auth: false, tags: ["Real-time"] },
];

const ALL_TAGS = [...new Set(ENDPOINTS.flatMap(e => e.tags))];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <CheckCheck size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}

export default function SwaggerPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [activeTag, setActiveTag] = useState("Auth");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = ENDPOINTS.filter(e => e.tags.includes(activeTag));

  return (
    <div className="h-full overflow-y-auto bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Globe size={15} className="text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground">{isAr ? "توثيق API" : "API Reference"}</h1>
            <p className="text-[10px] text-muted-foreground">v1.0 · Base: <span className="font-mono text-primary">/api</span></p>
          </div>
          <div className="ms-auto flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {isAr ? "مباشر" : "Live"}
            </span>
          </div>
        </div>

        {/* Tag pills */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {ALL_TAGS.map(tag => (
            <button key={tag} onClick={() => setActiveTag(tag)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all ${
                activeTag === tag
                  ? "bg-primary text-white border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/40"
              }`}>
              {tag}
              <span className="ms-1.5 opacity-60">
                {ENDPOINTS.filter(e => e.tags.includes(tag)).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <div className="p-5 space-y-2">
        <AnimatePresence mode="popLayout">
          {filtered.map(ep => {
            const key = ep.method + ep.path;
            const isOpen = expanded === key;
            return (
              <motion.div key={key} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl bg-card border border-border overflow-hidden">
                <button className="w-full flex items-center gap-3 px-4 py-3 text-start"
                  onClick={() => setExpanded(isOpen ? null : key)}>
                  <span className={`px-2 py-1 rounded-lg text-[10px] font-bold border shrink-0 font-mono ${METHOD_COLOR[ep.method]}`}>
                    {ep.method}
                  </span>
                  <code className="text-xs text-foreground font-mono flex-1 truncate">{ep.path}</code>
                  <div className="flex items-center gap-2 shrink-0">
                    {ep.auth && <Lock size={10} className="text-amber-400" />}
                    {ep.roles && (
                      <span className="text-[9px] text-muted-foreground hidden sm:block">
                        {ep.roles.join(",")}
                      </span>
                    )}
                    <ChevronDown size={12} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border overflow-hidden">
                      <div className="p-4 space-y-3">
                        <p className="text-xs text-muted-foreground">{isAr ? ep.summaryAr : ep.summary}</p>

                        {/* Auth */}
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">{isAr ? "المصادقة" : "Auth"}:</span>
                          {ep.auth
                            ? <span className="flex items-center gap-1 text-amber-400"><Lock size={10} /> Bearer JWT</span>
                            : <span className="text-emerald-400">{isAr ? "عام" : "Public"}</span>}
                          {ep.roles && (
                            <>
                              <span className="text-muted-foreground">|</span>
                              <span className="text-muted-foreground">{isAr ? "الأدوار" : "Roles"}:</span>
                              <div className="flex gap-1">
                                {ep.roles.map(r => (
                                  <span key={r} className="px-1.5 py-0.5 rounded text-[9px] bg-secondary border border-border text-foreground font-mono">{r}</span>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        {/* Example curl */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">cURL</span>
                            <CopyButton text={`curl -X ${ep.method} https://api.foodpro.app${ep.path}${ep.auth ? " \\\n  -H 'Authorization: Bearer {token}'" : ""}${ep.request ? ` \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(ep.request)}'` : ""}`} />
                          </div>
                          <pre className="text-[10px] font-mono text-emerald-400 bg-background border border-border rounded-xl p-3 overflow-x-auto leading-relaxed">
{`curl -X ${ep.method} https://api.foodpro.app${ep.path}${ep.auth ? `\n  -H 'Authorization: Bearer {token}'` : ""}${ep.request ? `\n  -H 'Content-Type: application/json'\n  -d '${JSON.stringify(ep.request, null, 2)}'` : ""}`}
                          </pre>
                        </div>

                        {/* Response preview */}
                        {ep.response && (
                          <div>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">{isAr ? "مثال الاستجابة" : "Response Example"}</p>
                            <pre className="text-[10px] font-mono text-blue-400 bg-background border border-border rounded-xl p-3 overflow-x-auto leading-relaxed max-h-28">
                              {JSON.stringify(ep.response, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Tags */}
                        <div className="flex gap-1.5">
                          {ep.tags.map(t => (
                            <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] bg-secondary border border-border text-muted-foreground">
                              <Tag size={8} />{t}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Footer */}
        <div className="pt-4 text-center">
          <p className="text-[10px] text-muted-foreground">
            {isAr ? "واجهة برمجية RESTful • JSON • TLS 1.3" : "RESTful API · JSON · TLS 1.3"}
          </p>
          <a href="/api/openapi.json" target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary hover:underline">
            <ArrowRight size={10} />
            {isAr ? "تحميل مواصفات OpenAPI" : "Download OpenAPI Spec"}
          </a>
        </div>
      </div>
    </div>
  );
}

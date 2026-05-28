import React, { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  ShoppingCart, ChefHat, Settings, Grid3X3, LogOut,
  Users, Truck, Tag, DollarSign, Brain, GitBranch, UserCog,
  TrendingUp, Webhook, Code2, Star, CreditCard, Shield, Bell,
  BookOpen, QrCode, Building2, Receipt, LayoutGrid, Package,
  BarChart3, Lock, Grip, X, ArrowLeftRight, Clock as ClockIcon, FileEdit, Check,
} from "lucide-react";
import { QuickSwitch } from "@/components/quick-switch";
import { useGetDashboardStats } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { useUser, useClerk, useAuth as useClerkAuth } from "@/lib/clerk-shim";
import { useCurrency } from "@/contexts/currency";
import { NotificationBell, useNotifications } from "@/components/notifications";
import { useSse } from "@/hooks/use-sse";
import { AiChatBot } from "@/components/ai-chat-bot";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { SUPPORTED_LANGUAGES } from "@/i18n/languages";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useNotificationsBootstrap } from "@/lib/notifications";

const FOODPRO_TOKEN_KEY = "foodoro-token";

/* ═══════════════════════════════════════════════════════
   CURRENCY SELECTOR
═══════════════════════════════════════════════════════ */
function CurrencySelector() {
  const { currency, currencies, setCurrency } = useCurrency();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-10 h-10 rounded-xl border border-border bg-background flex flex-col items-center justify-center text-[9px] font-bold text-muted-foreground hover:text-foreground hover:border-primary transition-colors gap-0"
          >
            <DollarSign size={11} className="text-primary" />
            <span className="leading-none">{currency.code}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-card border-border text-foreground">
          {isAr ? "تغيير العملة" : "Change Currency"}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div className="absolute bottom-0 start-12 z-50 w-52 bg-card border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden py-1">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs text-muted-foreground font-medium">
              {isAr ? "اختر العملة" : "Select Currency"}
            </p>
          </div>
          {currencies.map((c) => (
            <button
              key={c.code}
              onClick={() => { setCurrency(c.code); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent text-start
                ${c.code === currency.code ? "bg-primary/10 text-primary" : "text-foreground"}`}
            >
              <span className="w-8 text-center font-mono text-xs text-muted-foreground">{c.symbol}</span>
              <div className="flex-1">
                <p className="font-medium text-xs">{c.code}</p>
                <p className="text-[10px] text-muted-foreground">{isAr ? c.nameAr : c.name}</p>
              </div>
              {c.code === currency.code && (
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TOOLS MENU — dropdown holding low-frequency utilities
   (Kitchen, Amendments, Notifications, Language switcher).
   Keeps the main rail uncluttered per UX spec.
═══════════════════════════════════════════════════════ */
interface ToolsMenuProps {
  notifications: ReturnType<typeof useNotifications>["notifications"];
  onReadAll: () => void;
  onClearAll: () => void;
}
function ToolsMenu({ notifications, onReadAll, onClearAll }: ToolsMenuProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"root" | "notifications" | "language">("root");
  const [, navigate] = useLocation();
  const unread = notifications.filter((n) => !n.read).length;

  const close = () => { setOpen(false); setView("root"); };

  return (
    <DropdownMenu open={open} onOpenChange={(v) => { setOpen(v); if (!v) setView("root"); }}>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-tools-menu"
          className="relative w-10 h-10 rounded-xl border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          title={i18n.language === "ar" ? "الأدوات" : "Tools"}
        >
          <Settings size={15} />
          {unread > 0 && (
            <span className="absolute -top-1 -end-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-white font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end" side="right"
        className="bg-card border-border text-foreground w-72 max-h-[480px] overflow-y-auto"
      >
        {view === "root" && (
          <>
            {/* Tool pages */}
            {TOOL_ITEMS.map((item) => (
              <DropdownMenuItem
                key={item.path}
                data-testid={item.testId}
                onClick={() => { navigate(item.path); close(); }}
                className="flex items-center gap-3 cursor-pointer py-2.5"
              >
                <item.icon size={16} className="text-primary" />
                <span className="text-sm">{t(item.labelKey)}</span>
              </DropdownMenuItem>
            ))}
            {/* Notifications expander */}
            <DropdownMenuItem
              data-testid="tool-notifications"
              onClick={(e) => { e.preventDefault(); setView("notifications"); }}
              className="flex items-center justify-between gap-3 cursor-pointer py-2.5"
            >
              <span className="flex items-center gap-3">
                <Bell size={16} className="text-primary" />
                <span className="text-sm">{i18n.language === "ar" ? "الإشعارات" : "Notifications"}</span>
              </span>
              {unread > 0 && (
                <span className="text-[10px] bg-destructive text-white rounded-full px-1.5 py-0.5">{unread}</span>
              )}
            </DropdownMenuItem>
            {/* Language expander */}
            <DropdownMenuItem
              data-testid="tool-language"
              onClick={(e) => { e.preventDefault(); setView("language"); }}
              className="flex items-center justify-between gap-3 cursor-pointer py-2.5"
            >
              <span className="flex items-center gap-3">
                <span className="text-base leading-none">
                  {SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.flag ?? "🌐"}
                </span>
                <span className="text-sm">{i18n.language === "ar" ? "اللغة" : "Language"}</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)?.nameNative ?? "—"}
              </span>
            </DropdownMenuItem>
          </>
        )}

        {view === "notifications" && (
          <div className="p-2">
            <div className="flex items-center justify-between mb-2 px-1">
              <button onClick={() => setView("root")} className="text-xs text-muted-foreground hover:text-foreground">← {i18n.language === "ar" ? "رجوع" : "Back"}</button>
              <div className="flex items-center gap-2">
                <button onClick={onReadAll} className="text-[10px] text-primary hover:underline">{i18n.language === "ar" ? "قراءة الكل" : "Mark all read"}</button>
                <button onClick={onClearAll} className="text-[10px] text-destructive hover:underline">{i18n.language === "ar" ? "مسح الكل" : "Clear"}</button>
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1">
              {notifications.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-6">
                  {i18n.language === "ar" ? "لا توجد إشعارات" : "No notifications"}
                </div>
              ) : (
                notifications.slice(0, 30).map((n) => (
                  <div key={n.id} className={`rounded-md px-2 py-2 text-xs ${n.read ? "bg-background/50 text-muted-foreground" : "bg-primary/10 text-foreground"}`}>
                    <div className="font-semibold">{n.title}</div>
                    {n.description && <div className="text-[11px] mt-0.5 opacity-80">{n.description}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {view === "language" && (
          <div className="p-2">
            <button onClick={() => setView("root")} className="text-xs text-muted-foreground hover:text-foreground mb-2 px-1">
              ← {i18n.language === "ar" ? "رجوع" : "Back"}
            </button>
            <div className="max-h-80 overflow-y-auto">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  data-testid={`tool-lang-${l.code}`}
                  onClick={() => { void i18n.changeLanguage(l.code); localStorage.setItem("foodoro-lang", l.code); close(); }}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent ${
                    l.code === i18n.language ? "bg-primary/10 text-primary font-semibold" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-base leading-none">{l.flag}</span>
                    <span>{l.nameNative}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">{l.nameEn}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ═══════════════════════════════════════════════════════
   LANGUAGE TOGGLE (25 languages)
═══════════════════════════════════════════════════════ */
function LanguageToggle() {
  const { i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const active = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) ?? SUPPORTED_LANGUAGES[0];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="button-language-toggle"
          className="w-10 h-10 rounded-xl border border-border bg-background flex items-center justify-center text-base font-bold text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
          title={active.nameNative}
        >
          {active.flag}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card border-border text-foreground max-h-[420px] overflow-y-auto w-60">
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            data-testid={`lang-option-${l.code}`}
            onClick={() => { void i18n.changeLanguage(l.code); localStorage.setItem("foodoro-lang", l.code); }}
            className="flex items-center justify-between gap-2 cursor-pointer text-xs"
          >
            <span className="flex items-center gap-2">
              <span className="text-base leading-none">{l.flag}</span>
              <span className="font-medium">{l.nameNative}</span>
              <span className="text-muted-foreground text-[10px]">{l.nameEn}</span>
            </span>
            {l.code === active.code && <Check size={13} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ═══════════════════════════════════════════════════════
   CLOCK
═══════════════════════════════════════════════════════ */
function LiveClock() {
  const [time, setTime] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return <span>{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>;
}

/* ═══════════════════════════════════════════════════════
   CASHIER ITEMS — always visible in the sidebar
═══════════════════════════════════════════════════════ */
/**
 * Primary rail items — always-visible, 3 entries only (per UX spec):
 *   1. POS (Point of Sale)
 *   2. QR Orders (table invoices)
 *   3. Tables
 * Everything else (Kitchen, Amendments, Notifications, Language) lives
 * inside the floating Tools menu so the rail stays uncluttered.
 */
const CASHIER_ITEMS = [
  { path: "/",                    icon: ShoppingCart, labelKey: "nav.pos",                testId: "nav-pos" },
  { path: "/qr-orders",           icon: Receipt,      labelKey: "nav.qrOrders",           testId: "nav-qr-orders-rail" },
  { path: "/tables",              icon: Grid3X3,      labelKey: "nav.tables",             testId: "nav-tables" },
] as const;

/** Items hidden inside the "Tools" dropdown next to the avatar. */
const TOOL_ITEMS = [
  { path: "/kitchen",             icon: ChefHat,      labelKey: "nav.kitchen",            testId: "tool-kitchen" },
  { path: "/cashier/amendments",  icon: FileEdit,     labelKey: "nav.cashierAmendments",  testId: "tool-amendments" },
] as const;

/* ═══════════════════════════════════════════════════════
   MANAGEMENT GROUPS — inside the apps panel
═══════════════════════════════════════════════════════ */
const MANAGEMENT_GROUPS = [
  {
    key: "menu",
    labelEn: "Menu & Stock", labelAr: "القائمة والمخزون",
    items: [
      { path: "/products",  icon: LayoutGrid, labelKey: "nav.products",  testId: "nav-products" },
      { path: "/inventory", icon: Package,    labelKey: "nav.inventory", testId: "nav-inventory" },
      { path: "/suppliers", icon: Truck,      labelKey: "nav.suppliers", testId: "nav-suppliers" },
      { path: "/coupons",   icon: Tag,        labelKey: "nav.coupons",   testId: "nav-coupons" },
    ],
  },
  {
    key: "sales",
    labelEn: "Sales & Finance", labelAr: "المبيعات والمالية",
    items: [
      { path: "/qr-orders",           icon: Receipt,    labelKey: "nav.qrOrders",          testId: "nav-qr-orders" },
      { path: "/reports",             icon: BarChart3,  labelKey: "nav.reports",           testId: "nav-reports" },
      { path: "/reports/advanced",    icon: TrendingUp, labelKey: "nav.reportsAdvanced",   testId: "nav-reports-advanced" },
      { path: "/financials/overview", icon: DollarSign, labelKey: "nav.financialsOverview",testId: "nav-financials-overview" },
      { path: "/payments",            icon: CreditCard, labelKey: "nav.payments",          testId: "nav-payments" },
      { path: "/loyalty",             icon: Star,       labelKey: "nav.loyalty",           testId: "nav-loyalty" },
      { path: "/ai/insights",         icon: Brain,      labelKey: "nav.aiInsights",        testId: "nav-ai-insights" },
    ],
  },
  {
    key: "customers",
    labelEn: "Customers & Staff", labelAr: "العملاء والفريق",
    items: [
      { path: "/customers",           icon: Users,      labelKey: "nav.customers",        testId: "nav-customers" },
      { path: "/customers/analytics", icon: TrendingUp, labelKey: "nav.customerAnalytics",testId: "nav-customer-analytics" },
      { path: "/staff",               icon: UserCog,    labelKey: "nav.staff",            testId: "nav-staff" },
      { path: "/cashier/shifts",      icon: ClockIcon,  labelKey: "nav.shifts",           testId: "nav-cashier-shifts" },
      { path: "/branches",            icon: GitBranch,  labelKey: "nav.branches",         testId: "nav-branches" },
    ],
  },
  {
    key: "operations",
    labelEn: "Operations", labelAr: "العمليات",
    items: [
      { path: "/floor-plan",    icon: Grid3X3, labelKey: "nav.floorPlan",    testId: "nav-floor-plan" },
      { path: "/qr-menu",       icon: QrCode,  labelKey: "nav.qrMenu",       testId: "nav-qr-menu" },
      { path: "/notifications", icon: Bell,    labelKey: "nav.notifications",testId: "nav-notifications" },
      { path: "/audit",         icon: Shield,  labelKey: "nav.audit",        testId: "nav-audit" },
      { path: "/security",      icon: Lock,    labelKey: "nav.security",     testId: "nav-security" },
      { path: "/security/fraud", icon: Shield,  labelKey: "nav.fraudMonitoring", testId: "nav-fraud" },
    ],
  },
  {
    key: "system",
    labelEn: "System", labelAr: "النظام",
    items: [
      { path: "/billing",            icon: Receipt,    labelKey: "billing.nav",          testId: "nav-billing" },
      { path: "/settings/discounts", icon: Tag,        labelKey: "nav.discountSettings", testId: "nav-discount-settings" },
      { path: "/settings/invoice",   icon: Receipt,    labelKey: "nav.invoiceSettings",  testId: "nav-invoice-settings" },
      { path: "/tenant/settings",    icon: Building2,  labelKey: "nav.tenantSettings",   testId: "nav-tenant-settings" },
      { path: "/settings",           icon: Settings,   labelKey: "nav.settings",         testId: "nav-settings" },
    ],
  },
] as const;

/* ═══════════════════════════════════════════════════════
   FUTURE ITEMS — shown in panel, navigate to coming-soon
═══════════════════════════════════════════════════════ */
const FUTURE_ITEMS = [
  { path: "/ai",                     icon: Brain,    labelKey: "nav.ai",                     testId: "nav-ai",                     phase: 3 },
  { path: "/inventory/intelligence", icon: Package,  labelKey: "nav.inventoryIntelligence",  testId: "nav-inventory-intelligence", phase: 3 },
  { path: "/financials",             icon: TrendingUp,labelKey: "nav.financials",            testId: "nav-financials",             phase: 3 },
  { path: "/staff-schedule",         icon: UserCog,  labelKey: "nav.staffSchedule",          testId: "nav-staff-schedule",         phase: 4 },
  { path: "/webhooks",               icon: Webhook,  labelKey: "nav.webhooks",               testId: "nav-webhooks",               phase: 6 },
  { path: "/developer",              icon: Code2,    labelKey: "nav.developer",              testId: "nav-developer",              phase: 6 },
  { path: "/api-docs",               icon: BookOpen, labelKey: "nav.apiDocs",                testId: "nav-api-docs",               phase: 6 },
] as const;

/* ═══════════════════════════════════════════════════════
   PLAN BADGE
═══════════════════════════════════════════════════════ */
const PLAN_BADGE: Record<string, { cls: string }> = {
  starter:    { cls: "bg-gray-600 text-gray-200" },
  pro:        { cls: "bg-blue-600 text-white" },
  enterprise: { cls: "bg-amber-500 text-black" },
};

interface BillingStatusMin { plan: string; status: string }

interface DashboardStatsMin {
  lowStockCount?: number;
  pendingKitchenTickets?: number;
}

/* ═══════════════════════════════════════════════════════
   SSE SYNC
═══════════════════════════════════════════════════════ */
function SseNotificationSync({ add }: { add: ReturnType<typeof useNotifications>["add"] }) {
  const queryClient = useQueryClient();
  useSse({
    events: {
      "order:created": (data) => {
        const order = data as { orderId: number; orderNumber?: string; type?: string };
        add({
          type: "order",
          titleEn: `New Order #${order.orderNumber ?? order.orderId}`,
          titleAr: `طلب جديد #${order.orderNumber ?? order.orderId}`,
          bodyEn: order.type ?? "dine-in",
          bodyAr: order.type ?? "داخلي",
        });
        // Invalidate everything affected by a new order
        void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/tickets"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
      },
      "ticket:updated": (data) => {
        const ticket = data as { ticketId: number; status?: string; orderId?: number };
        add({
          type: "kitchen",
          titleEn: `Ticket #${ticket.ticketId} updated`,
          titleAr: `تذكرة #${ticket.ticketId} تم تحديثها`,
          bodyEn: `Status: ${ticket.status ?? ""}`,
          bodyAr: `الحالة: ${ticket.status ?? ""}`,
        });
        // Cashier needs to see the updated order status too
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/tickets"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      },
      "inventory:low": (data) => {
        const alert = data as { inventoryId: number; name: string; quantity: number; unit: string; threshold: number };
        add({
          type: "alert",
          titleEn: "Low Stock Alert",
          titleAr: "تنبيه مخزون منخفض",
          bodyEn: `${alert.name} — ${alert.quantity} ${alert.unit} remaining (min: ${alert.threshold})`,
          bodyAr: `${alert.name} — ${alert.quantity} ${alert.unit} متبقية (الحد الأدنى: ${alert.threshold})`,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      },
      "stats:updated": () => {
        // Invalidate all report endpoints and orders — prefix ["/api/reports"] covers all sub-paths
        void queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      },
      "product:unavailable": (data) => {
        const p = data as { productId: number; productName: string; reason: string | null };
        add({
          type: "alert",
          titleEn: `Product Unavailable`,
          titleAr: `منتج غير متوفر`,
          bodyEn: `${p.productName}${p.reason ? ` — ${p.reason.replace(/_/g, " ")}` : ""}`,
          bodyAr: `${p.productName}${p.reason ? ` — ${p.reason.replace(/_/g, " ")}` : ""}`,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/availability"] });
      },
      "product:available": (data) => {
        const p = data as { productId: number; productName: string };
        add({
          type: "order",
          titleEn: `Product Available Again`,
          titleAr: `المنتج متوفر مجددًا`,
          bodyEn: p.productName,
          bodyAr: p.productName,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/availability"] });
      },
      "product:auto_enabled": (data) => {
        const p = data as { productId: number; productName: string; tenantId: number };
        add({
          type: "order",
          titleEn: `Product Auto Re-enabled`,
          titleAr: `إعادة تفعيل تلقائية`,
          bodyEn: `${p.productName} is available again (timer expired)`,
          bodyAr: `${p.productName} أصبح متوفرًا مجددًا (انتهى المؤقت)`,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/availability"] });
      },
      "ingredient:out_of_stock": (data) => {
        const d = data as { inventoryName: string; tenantId: number };
        add({
          type: "alert",
          titleEn: `Ingredient Out of Stock`,
          titleAr: `مكوّن نفد من المخزون`,
          bodyEn: d.inventoryName,
          bodyAr: d.inventoryName,
        });
        void queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/kitchen/availability"] });
      },
    },
  });
  return null;
}

/* ═══════════════════════════════════════════════════════
   MANAGEMENT PANEL
═══════════════════════════════════════════════════════ */
// No nav-level path restrictions — each page handles its own role-based access
// /security uses AccessDenied internally for non-admin users
const ADMIN_ONLY_PATHS = new Set<string>();

function ManagementPanel({
  open,
  onClose,
  location,
  stats,
  userRole,
}: {
  open: boolean;
  onClose: () => void;
  location: string;
  stats: DashboardStatsMin | undefined;
  userRole: string | null;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const isAdminOrOwner = ["owner", "admin", "platform_admin"].includes(userRole ?? "");

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-background/40 backdrop-blur-[1px]"
          onClick={onClose}
        />
      )}

      {/* Slide panel */}
      <div
        className={`
          fixed inset-y-0 start-16 w-64 bg-card border-e border-border z-30
          overflow-y-auto scrollbar-none py-3
          transition-all duration-200 ease-in-out
          ${open ? "opacity-100 translate-x-0 shadow-2xl shadow-black/50" : "opacity-0 -translate-x-4 pointer-events-none"}
        `}
        style={isAr && open ? { transform: "translateX(0)" } : undefined}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-border mb-2">
          <div>
            <p className="text-sm font-bold text-foreground">
              {isAr ? "لوحة الإدارة" : "Management"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isAr ? "كل الأدوات في مكان واحد" : "All tools in one place"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Management groups */}
        {MANAGEMENT_GROUPS.map((group) => (
          <div key={group.key} className="mb-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2">
              {isAr ? group.labelAr : group.labelEn}
            </p>
            {group.items.filter(({ path }) => !ADMIN_ONLY_PATHS.has(path) || isAdminOrOwner).map(({ path, icon: Icon, labelKey, testId }) => {
              const active = location === path || location.startsWith(path + "/");
              return (
                <Link key={path} href={path} onClick={onClose}>
                  <button
                    data-testid={testId}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-start
                      ${active
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                  >
                    <Icon size={15} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
                    <span className="flex-1">{t(labelKey)}</span>
                    {path === "/inventory" && (stats?.lowStockCount ?? 0) > 0 && (
                      <span className="w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-white font-bold shrink-0">
                        {stats!.lowStockCount}
                      </span>
                    )}
                  </button>
                </Link>
              );
            })}
          </div>
        ))}

        {/* Future additions */}
        <div className="mt-2 mx-3 rounded-xl border border-dashed border-border overflow-hidden">
          <div className="px-3 py-2 bg-muted/30">
            <div className="flex items-center gap-1.5">
              <Lock size={10} className="text-muted-foreground" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {isAr ? "إضافات مستقبلية" : "Future Additions"}
              </p>
            </div>
          </div>
          {FUTURE_ITEMS.map(({ path, icon: Icon, labelKey, testId, phase }) => (
            <Link key={path} href={path} onClick={onClose}>
              <button
                data-testid={testId}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors text-start text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/50"
              >
                <Icon size={14} strokeWidth={1.5} className="shrink-0 opacity-60" />
                <span className="flex-1 text-xs">{t(labelKey)}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground/70 shrink-0">
                  P{phase}
                </span>
              </button>
            </Link>
          ))}
        </div>

        <div className="h-4" />
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   LAYOUT
═══════════════════════════════════════════════════════ */
export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: stats } = useGetDashboardStats();
  const { t } = useTranslation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useClerkAuth();

  // Fetch DB user role for admin-only nav gating
  const { data: meData } = useQuery<{ role: string }>({
    queryKey: ["layout-me-role"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${basePth}/api/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) return { role: "" };
      const body = await res.json() as { user?: { role?: string } };
      return { role: body.user?.role ?? "" };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const { notifications, add, markRead, markAllRead, del, clear } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const basePth = import.meta.env.BASE_URL.replace(/\/$/, "");
  useNotificationsBootstrap();

  const { data: billing } = useQuery<BillingStatusMin>({
    queryKey: ["billing-status"],
    queryFn: async () => {
      const res = await fetch(`${basePth}/api/billing/status`, { credentials: "include" });
      if (!res.ok) return { plan: "starter", status: "active" };
      return res.json() as Promise<BillingStatusMin>;
    },
    staleTime: 60_000,
  });
  const planBadge = PLAN_BADGE[billing?.plan ?? "starter"] ?? PLAN_BADGE.starter;

  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ||
    "User";
  const avatarLetter = displayName.charAt(0).toUpperCase();

  // Close panel when navigating
  useEffect(() => {
    setPanelOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <SseNotificationSync add={add} />

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="relative z-40 flex flex-col items-center w-16 min-h-screen py-4 gap-2 border-e border-border bg-card shrink-0">

        {/* Logo + plan badge */}
        <div className="flex flex-col items-center gap-1 mb-1">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary cursor-pointer"
            data-testid="logo"
            onClick={() => window.location.href = basePth + "/"}
          >
            <span className="text-white font-black text-sm select-none">F</span>
          </div>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <a
                href={`${basePth}/billing`}
                className={`w-10 h-5 rounded-md flex items-center justify-center text-[9px] font-bold cursor-pointer transition-opacity hover:opacity-80 ${planBadge.cls}`}
              >
                {(billing?.plan ?? "starter").toUpperCase().slice(0, 3)}
              </a>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-border text-foreground">
              <div className="text-xs">
                <p className="font-semibold">{t("billing.currentPlan")}</p>
                <p className="text-muted-foreground capitalize">{billing?.plan ?? "starter"}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Cashier items */}
        <div className="flex flex-col items-center gap-1 w-full px-2">
          {CASHIER_ITEMS.map(({ path, icon: Icon, labelKey, testId }) => {
            const active = location === path;
            return (
              <Tooltip key={path} delayDuration={100}>
                <TooltipTrigger asChild>
                  <Link href={path}>
                    <button
                      data-testid={testId}
                      className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150
                        ${active
                          ? "bg-primary text-white shadow-lg shadow-primary/30"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        }`}
                    >
                      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                    </button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-card border-border text-foreground">
                  {t(labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-8 h-px bg-border my-1" />

        {/* Apps / Management button */}
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <button
              data-testid="nav-apps"
              onClick={() => setPanelOpen((v) => !v)}
              className={`relative flex items-center justify-center w-11 h-11 rounded-xl transition-all duration-150
                ${panelOpen
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
            >
              <Grip size={20} strokeWidth={2} />
              {/* Badge if any management page is active */}
              {MANAGEMENT_GROUPS.some(g => g.items.some(i => location === i.path || location.startsWith(i.path + "/"))) && (
                <span className="absolute top-1.5 end-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-card border-border text-foreground">
            {t("nav.management")}
          </TooltipContent>
        </Tooltip>

        {/* Flex spacer */}
        <div className="flex-1" />

        {/* Bottom utilities */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          {user && (
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center cursor-default">
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={displayName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary flex items-center justify-center">
                      <span className="text-xs font-bold text-foreground">{avatarLetter}</span>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="bg-card border-border text-foreground">
                <div className="text-xs">
                  <p className="font-semibold">{displayName}</p>
                  <p className="text-muted-foreground">{user.emailAddresses?.[0]?.emailAddress}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Quick Switch */}
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setQuickSwitchOpen(true)}
                data-testid="button-quick-switch"
                className="w-10 h-10 rounded-xl border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-orange-500 hover:border-orange-500/50 transition-colors"
              >
                <ArrowLeftRight size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-border text-foreground">
              {t("i18n.language") === "ar" ? "تبديل سريع" : "Quick Switch"}
            </TooltipContent>
          </Tooltip>

          <CurrencySelector />

          {/* Consolidated Tools menu (Kitchen, Amendments, Notifications, Language) */}
          <ToolsMenu
            notifications={notifications}
            onReadAll={markAllRead}
            onClearAll={clear}
          />

          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                onClick={() => signOut({ redirectUrl: basePth + "/sign-in" })}
                data-testid="button-logout"
                className="w-10 h-10 rounded-xl border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
              >
                <LogOut size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-card border-border text-foreground">
              {t("auth.logout")}
            </TooltipContent>
          </Tooltip>

          <div className="text-[10px] text-muted-foreground text-center">
            <LiveClock />
          </div>
        </div>
      </aside>

      {/* ── Quick Switch ─────────────────────────────────────── */}
      <QuickSwitch
        open={quickSwitchOpen}
        onClose={() => setQuickSwitchOpen(false)}
        onSwitch={({ name }) => {
          setQuickSwitchOpen(false);
        }}
      />

      {/* ── Management Panel ──────────────────────────────────── */}
      <ManagementPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        location={location}
        stats={stats}
        userRole={meData?.role ?? null}
      />

      {/* ── Main Content ─────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden relative z-10 flex flex-col">
        <SubscriptionBanner />
        <div className="flex-1 overflow-hidden">{children}</div>
      </main>

      {/* ── Floating AI Assistant ────────────────────────────── */}
      <AiChatBot />

      {/* ── Offline / Sync Indicator ─────────────────────────── */}
      <OfflineIndicator />
    </div>
  );
}

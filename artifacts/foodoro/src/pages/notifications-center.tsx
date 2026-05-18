import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, BellOff, CheckCheck, Trash2, ShoppingBag, ChefHat, AlertTriangle, Info, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

type NotifType = "order" | "kitchen" | "alert" | "info" | "loyalty";

interface Notification {
  id: string;
  type: NotifType;
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  read: boolean;
  createdAt: Date;
}

const ICONS: Record<NotifType, React.ElementType> = {
  order:   ShoppingBag,
  kitchen: ChefHat,
  alert:   AlertTriangle,
  info:    Info,
  loyalty: Star,
};

const COLORS: Record<NotifType, string> = {
  order:   "text-primary bg-primary/10",
  kitchen: "text-amber-400 bg-amber-400/10",
  alert:   "text-red-400 bg-red-400/10",
  info:    "text-blue-400 bg-blue-400/10",
  loyalty: "text-purple-400 bg-purple-400/10",
};

const DEMO: Notification[] = [
  { id: "1", type: "order", title: "New Order #1042", titleAr: "طلب جديد #1042", body: "Table 5 — 3 items", bodyAr: "طاولة 5 — 3 منتجات", read: false, createdAt: new Date(Date.now() - 120000) },
  { id: "2", type: "kitchen", title: "Ticket Ready", titleAr: "التذكرة جاهزة", body: "Order #1039 is ready for pickup", bodyAr: "الطلب #1039 جاهز للاستلام", read: false, createdAt: new Date(Date.now() - 360000) },
  { id: "3", type: "alert", title: "Low Stock", titleAr: "مخزون منخفض", body: "Chicken Shawarma is almost out", bodyAr: "شاورما الدجاج على وشك النفاد", read: false, createdAt: new Date(Date.now() - 900000) },
  { id: "4", type: "loyalty", title: "Points Redeemed", titleAr: "تم استرداد النقاط", body: "Customer redeemed 500 points", bodyAr: "استرد العميل 500 نقطة", read: true, createdAt: new Date(Date.now() - 3600000) },
  { id: "5", type: "info", title: "Daily Report Ready", titleAr: "التقرير اليومي جاهز", body: "Yesterday's sales report is available", bodyAr: "تقرير مبيعات أمس متاح الآن", read: true, createdAt: new Date(Date.now() - 7200000) },
];

function timeSince(d: Date, isAr: boolean) {
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return isAr ? "الآن" : "just now";
  if (m < 60) return isAr ? `${m} دقيقة` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `${h} ساعة` : `${h}h ago`;
  return isAr ? `${Math.floor(h / 24)} يوم` : `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsCenterPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [notifs, setNotifs] = useState<Notification[]>(DEMO);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const displayed = filter === "unread" ? notifs.filter(n => !n.read) : notifs;
  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(n => n.map(x => ({ ...x, read: true })));
  const markRead = (id: string) => setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
  const remove = (id: string) => setNotifs(n => n.filter(x => x.id !== id));
  const clearAll = () => setNotifs([]);

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell size={18} className="text-primary" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "مركز الإشعارات" : "Notifications"}</h1>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? isAr ? `${unreadCount} إشعار غير مقروء` : `${unreadCount} unread`
                : isAr ? "كل شيء مقروء" : "All caught up"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
              <CheckCheck size={12} />{isAr ? "قراءة الكل" : "Mark all read"}
            </button>
          )}
          {notifs.length > 0 && (
            <button onClick={clearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-xs text-red-400 hover:text-red-300 transition-colors">
              <Trash2 size={12} />{isAr ? "مسح الكل" : "Clear all"}
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-card border border-border w-fit">
        {(["all", "unread"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
            {f === "all" ? (isAr ? "الكل" : "All") : (isAr ? "غير مقروء" : "Unread")}
            {f === "unread" && unreadCount > 0 && (
              <span className="ms-1.5 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[9px] font-bold">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-2xl text-muted-foreground">
            <BellOff size={28} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا توجد إشعارات" : "No notifications"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {displayed.map(n => {
              const Icon = ICONS[n.type];
              const colorCls = COLORS[n.type];
              return (
                <motion.div key={n.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                  className={`p-3.5 rounded-2xl bg-card border border-border transition-opacity ${n.read ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorCls}`}>
                      <Icon size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{isAr ? n.titleAr : n.title}</p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{isAr ? n.bodyAr : n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{timeSince(n.createdAt, isAr)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!n.read && (
                        <button onClick={() => markRead(n.id)}
                          className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-primary transition-colors">
                          <CheckCheck size={12} />
                        </button>
                      )}
                      <button onClick={() => remove(n.id)}
                        className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

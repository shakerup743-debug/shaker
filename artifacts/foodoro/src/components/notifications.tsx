import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, X, ShoppingCart, ChefHat, AlertTriangle, CheckCircle, Info, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface AppNotification {
  id: string;
  type: "order" | "kitchen" | "alert" | "success" | "info";
  titleEn: string;
  titleAr: string;
  bodyEn?: string;
  bodyAr?: string;
  at: Date;
  read: boolean;
}

const TYPE_META = {
  order:   { icon: ShoppingCart, color: "text-primary bg-primary/10 border-primary/20" },
  kitchen: { icon: ChefHat,      color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  alert:   { icon: AlertTriangle,color: "text-red-400 bg-red-400/10 border-red-400/20" },
  success: { icon: CheckCircle,  color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  info:    { icon: Info,         color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
};

function relativeTime(d: Date, isAr: boolean): string {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return isAr ? "الآن" : "now";
  if (diff < 3600) return isAr ? `${Math.floor(diff / 60)}د` : `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return isAr ? `${Math.floor(diff / 3600)}س` : `${Math.floor(diff / 3600)}h`;
  return isAr ? `${Math.floor(diff / 86400)}ي` : `${Math.floor(diff / 86400)}d`;
}

interface NotificationsProps {
  notifications: AppNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function NotificationBell({ notifications, onRead, onReadAll, onDelete, onClear }: NotificationsProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter(n => !n.read).length;

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
            onClick={() => setOpen(v => !v)}
            className="w-10 h-10 rounded-xl border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors relative"
          >
            <Bell size={15} />
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                className="absolute -top-1 -end-1 w-4 h-4 bg-destructive rounded-full flex items-center justify-center text-[9px] text-white font-bold"
              >
                {unread > 9 ? "9+" : unread}
              </motion.span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-card border-border text-foreground">
          {isAr ? "الإشعارات" : "Notifications"}
        </TooltipContent>
      </Tooltip>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: -8, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-0 start-12 z-50 w-80 bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-primary" />
                <span className="text-sm font-semibold text-foreground">{isAr ? "الإشعارات" : "Notifications"}</span>
                {unread > 0 && (
                  <span className="w-5 h-5 bg-destructive rounded-full flex items-center justify-center text-[9px] text-white font-bold">{unread}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={onReadAll} className="text-[10px] text-primary hover:underline">
                    {isAr ? "قراءة الكل" : "Mark all read"}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button onClick={onClear} className="w-6 h-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 ms-1">
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Bell size={24} className="mb-2 opacity-30" />
                  <p className="text-xs">{isAr ? "لا توجد إشعارات" : "No notifications"}</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {notifications.map(n => {
                    const meta = TYPE_META[n.type];
                    const Icon = meta.icon;
                    return (
                      <motion.div
                        key={n.id}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        onClick={() => onRead(n.id)}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-border/50 cursor-pointer hover:bg-accent/30 transition-colors ${!n.read ? "bg-primary/5" : ""}`}
                      >
                        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${meta.color}`}>
                          <Icon size={12} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <p className={`text-xs font-semibold leading-tight ${n.read ? "text-muted-foreground" : "text-foreground"}`}>
                              {isAr ? n.titleAr : n.titleEn}
                            </p>
                            <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(n.at, isAr)}</span>
                          </div>
                          {(n.bodyEn || n.bodyAr) && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed truncate">
                              {isAr ? n.bodyAr : n.bodyEn}
                            </p>
                          )}
                          {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary mt-1" />}
                        </div>
                        <button onClick={e => { e.stopPropagation(); onDelete(n.id); }} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
                          <X size={10} />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const add = useCallback((n: Omit<AppNotification, "id" | "at" | "read">) => {
    setNotifications(prev => [
      { ...n, id: `${Date.now()}-${Math.random()}`, at: new Date(), read: false },
      ...prev.slice(0, 49),
    ]);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const del = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  return { notifications, add, markRead, markAllRead, del, clear };
}

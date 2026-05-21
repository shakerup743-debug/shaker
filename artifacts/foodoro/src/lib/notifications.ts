/**
 * Browser push-style notifications for kitchen → cashier alerts.
 * Uses the standard `Notification` API (no server-side push needed yet).
 *
 * When a `ticket:updated` event arrives with status=ready, fire a desktop
 * notification with the order number so cashiers see it even if they're
 * on a different tab/window. Falls back to a sonner toast when permission
 * isn't granted.
 */
import { useEffect } from "react";

export interface OrderReadyPayload {
  orderId?: number;
  orderNumber?: string;
  status?: string;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

export function showOrderReadyNotification(payload: OrderReadyPayload, isAr = true): void {
  const id = payload.orderNumber ?? payload.orderId ?? "—";
  const title = isAr ? "🔔 طلب جاهز!" : "🔔 Order Ready";
  const body = isAr
    ? `الطلب رقم ${id} جاهز للاستلام من المطبخ`
    : `Order #${id} is ready for pickup from the kitchen`;

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body,
        icon: "/favicon.svg",
        badge: "/favicon.svg",
        tag: `order-ready-${id}`,
        renotify: true,
        requireInteraction: false,
      });
      n.onclick = () => { window.focus(); n.close(); };
      // Auto-close after 8 seconds
      setTimeout(() => n.close(), 8000);
      return;
    } catch {
      /* fall through to in-app indicator */
    }
  }
  // Fallback: inline DOM toast
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.textContent = `🔔 ${body}`;
  el.setAttribute("data-testid", "order-ready-toast");
  el.style.cssText =
    "position:fixed;top:20px;right:20px;background:#10b981;color:#fff;" +
    "padding:14px 20px;border-radius:12px;z-index:9999;font-weight:600;" +
    "box-shadow:0 10px 25px rgba(0,0,0,.3);font-size:14px;max-width:320px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

/**
 * Mounts a permission requester. Call once from the layout so we ask the
 * user one time, then never bother them again.
 */
export function useNotificationsBootstrap(): void {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      // Defer the prompt slightly to avoid blocking initial render.
      const id = setTimeout(() => { void Notification.requestPermission(); }, 3000);
      return () => clearTimeout(id);
    }
  }, []);
}

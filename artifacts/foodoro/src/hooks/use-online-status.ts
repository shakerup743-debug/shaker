/**
 * useOnlineStatus + automatic queue flushing.
 *
 * Hook into <App /> once. Whenever connectivity returns, it replays the
 * offline operation queue and surfaces a toast with the result.
 */
import { useEffect, useState } from "react";
import { flushQueue, pendingCount } from "@/lib/offline-db";

export function useOnlineStatus(): { online: boolean; pending: number } {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [pending, setPending] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    void pendingCount().then((c) => { if (!cancelled) setPending(c); });

    const onUp = async () => {
      setOnline(true);
      const { ok } = await flushQueue();
      const c = await pendingCount();
      if (!cancelled) setPending(c);
      if (ok > 0 && "Notification" in window) {
        // Best-effort toast via DOM (no toast hook dep)
        const div = document.createElement("div");
        div.textContent = `✓ تمت مزامنة ${ok} طلب`;
        div.style.cssText = "position:fixed;bottom:20px;left:20px;background:#10b981;color:#fff;padding:10px 16px;border-radius:8px;z-index:9999;font-size:13px";
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
      }
    };
    const onDown = () => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);

    const id = setInterval(async () => {
      const c = await pendingCount();
      if (!cancelled) setPending(c);
      if (navigator.onLine && c > 0) await flushQueue();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
    };
  }, []);

  return { online, pending };
}

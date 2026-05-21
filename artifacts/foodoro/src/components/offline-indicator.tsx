/**
 * Floating indicator at bottom-right showing online/offline state +
 * pending sync count. Stays out of the way when everything is healthy.
 */
import { Wifi, WifiOff, CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineIndicator(): JSX.Element | null {
  const { online, pending } = useOnlineStatus();
  if (online && pending === 0) return null;

  return (
    <div
      data-testid="offline-indicator"
      className={`fixed bottom-4 ${typeof document !== "undefined" && document.dir === "rtl" ? "left-4" : "right-4"} z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg border text-xs font-medium ${
        online
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-destructive/15 text-destructive border-destructive/30"
      }`}
    >
      {online ? (
        <>
          <CloudOff size={13} />
          <span>قيد المزامنة… {pending}</span>
        </>
      ) : (
        <>
          <WifiOff size={13} />
          <span>وضع عدم الاتصال {pending > 0 ? `(${pending})` : ""}</span>
        </>
      )}
      {online && <Wifi size={11} className="opacity-50" />}
    </div>
  );
}

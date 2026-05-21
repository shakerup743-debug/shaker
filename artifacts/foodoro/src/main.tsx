import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

// ── Register the Workbox service worker for offline support ────────────
if (typeof window !== "undefined") {
  registerSW({
    immediate: true,
    onRegistered(reg) {
      // Re-check for SW updates every 60 minutes.
      if (reg) setInterval(() => { void reg.update(); }, 60 * 60 * 1000);
    },
  });
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "#111827",
            color: "#F9FAFB",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            ⚠️
          </div>
          <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            حدث خطأ غير متوقع
          </p>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>
            An unexpected error occurred. Please reload the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "10px 24px",
              background: "#E67E22",
              border: "none",
              borderRadius: 12,
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            إعادة تحميل / Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

/**
 * <OrderAttachmentInput /> — small file/URL upload widget used in POS and
 * QR menu. Lets the cashier or customer attach a single image to an order
 * (e.g. screenshot of a special request, photo of a damaged dish, etc).
 *
 * Responsibilities:
 *  • Uploads to /api/uploads/image (multipart) and surfaces the returned URL
 *  • Falls back to /api/uploads/image-base64 for QR (no auth header)
 *  • Calls onChange(url|null) so the parent can persist it with the order
 */
import { useState } from "react";
import { Camera, Loader2, X, Image as ImageIcon } from "lucide-react";

interface Props {
  /** Current attachment URL (or null when none) */
  value: string | null;
  onChange: (url: string | null) => void;
  /** When true, uses the public base64 endpoint that doesn't require auth.
   *  Use this on the QR-menu flow. */
  publicMode?: boolean;
  testIdPrefix?: string;
}

const TOKEN = "foodoro-token";

export function OrderAttachmentInput({
  value, onChange, publicMode = false, testIdPrefix = "order-attach",
}: Props): JSX.Element {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      setError("الصورة أكبر من 4 ميغا");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      if (publicMode) {
        // Read as base64 then POST to image-base64 (no auth)
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const r = await fetch("/api/uploads/image-base64", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl }),
        });
        const j = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error ?? "فشل الرفع");
        onChange(j.url);
      } else {
        const t = localStorage.getItem(TOKEN);
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/uploads/image", {
          method: "POST",
          headers: t ? { Authorization: `Bearer ${t}` } : {},
          body: fd,
        });
        const j = (await r.json()) as { url?: string; error?: string };
        if (!r.ok || !j.url) throw new Error(j.error ?? "فشل الرفع");
        onChange(j.url);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div className="relative inline-block" data-testid={`${testIdPrefix}-preview`}>
        <img
          src={value} alt="attachment"
          className="w-20 h-20 object-cover rounded-lg border border-border"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          data-testid={`${testIdPrefix}-remove`}
          className="absolute -top-2 -end-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center"
          title="إزالة الصورة"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/heic"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
          disabled={uploading}
          className="hidden"
          data-testid={`${testIdPrefix}-file-input`}
        />
        <div
          className={`flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed cursor-pointer text-xs transition-colors ${
            uploading
              ? "border-primary/40 bg-primary/5 text-primary"
              : "border-border bg-background hover:border-primary/60 hover:bg-primary/5 text-muted-foreground"
          }`}
          data-testid={`${testIdPrefix}-trigger`}
        >
          {uploading ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>جاري الرفع…</span>
            </>
          ) : (
            <>
              <Camera size={13} />
              <span>إرفاق صورة (اختياري)</span>
            </>
          )}
        </div>
      </label>
      {error && (
        <p className="text-[10px] text-destructive">
          <ImageIcon size={10} className="inline me-1" />{error}
        </p>
      )}
    </div>
  );
}

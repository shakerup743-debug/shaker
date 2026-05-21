/**
 * Lightweight image upload — stores files on local disk under /app/uploads/products
 * and returns a public URL the frontend writes to products.imageUrl.
 *
 * Two ways to upload:
 *   1) POST /api/uploads/image (multipart/form-data, field "file")  — direct phone upload
 *   2) POST /api/uploads/image-base64 { dataUrl: "data:image/png;base64,..." } — paste/drag
 *
 * Constraints:
 *   - max 4 MB
 *   - JPEG / PNG / WebP / GIF only
 *   - filename randomized (no PII)
 */
import { Router, type Request, type Response } from "express";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import multer from "multer";
import { authenticate } from "../middleware/authenticate.js";

const router = Router();

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.resolve("/app/uploads/products");

async function ensureDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg": return ".jpg";
    case "image/png":  return ".png";
    case "image/webp": return ".webp";
    case "image/gif":  return ".gif";
    default:           return ".bin";
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error("INVALID_TYPE"));
  },
});

router.post(
  "/uploads/image",
  authenticate,
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) { res.status(400).json({ error: "ملف غير صالح" }); return; }
    try {
      await ensureDir();
      const name = crypto.randomBytes(16).toString("hex") + extFromMime(req.file.mimetype);
      await fs.writeFile(path.join(UPLOAD_DIR, name), req.file.buffer);
      res.json({ ok: true, url: `/api/uploads/products/${name}` });
    } catch {
      res.status(500).json({ error: "فشل رفع الصورة" });
    }
  },
);

router.post(
  "/uploads/image-base64",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const { dataUrl } = req.body as { dataUrl?: string };
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      res.status(400).json({ error: "صورة غير صالحة" });
      return;
    }
    const m = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/);
    if (!m) { res.status(400).json({ error: "صيغة غير صالحة" }); return; }
    const mime = m[1].toLowerCase();
    if (!ALLOWED.has(mime)) { res.status(400).json({ error: "نوع الصورة غير مدعوم" }); return; }
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > MAX_BYTES) { res.status(413).json({ error: "حجم الصورة أكبر من 4 ميغا" }); return; }

    try {
      await ensureDir();
      const name = crypto.randomBytes(16).toString("hex") + extFromMime(mime);
      await fs.writeFile(path.join(UPLOAD_DIR, name), buffer);
      res.json({ ok: true, url: `/api/uploads/products/${name}` });
    } catch {
      res.status(500).json({ error: "فشل حفظ الصورة" });
    }
  },
);

export default router;

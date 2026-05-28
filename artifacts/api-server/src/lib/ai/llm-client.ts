// Shared LLM client for the AI engines (predictive, recommendation, anomaly).
//
// All AI calls go through the existing Python sidecar on :9000, which uses
// emergentintegrations + Claude Haiku 4.5 + EMERGENT_LLM_KEY. This keeps a
// single configurable LLM surface and avoids adding new Node-side SDKs.
//
// The sidecar exposes POST /chat — we adapt our richer prompt shape to it.

import { logger } from "../logger.js";

const SIDECAR_URL = process.env.AI_SIDECAR_URL ?? "http://127.0.0.1:9000";

export interface LlmReasoningOptions {
  /** Compact JSON or markdown payload describing the data the LLM should analyse */
  dataContext: string;
  /** Specific question/task for the LLM */
  question: string;
  /** Override system role. Defaults to senior-restaurant-analyst persona. */
  systemPrompt?: string;
  /** Stable id so the sidecar can reuse conversation memory if desired */
  sessionId?: string;
  /** Soft timeout (ms) — falls back to a deterministic empty string when exceeded */
  timeoutMs?: number;
}

const DEFAULT_SYSTEM = `أنت محلل أعمال خبير في إدارة المطاعم بالمملكة العربية السعودية.
تجيب باللغة العربية بأسلوب مباشر ومختصر وعملي.
تركز على توصيات قابلة للتنفيذ مدعومة بالأرقام، لا على شرح عام.
عندما تستلم بيانات JSON أو ملخصات إحصائية، حللها بدقة وأخرج 3-5 نقاط فقط، كل نقطة سطر واحد.
لا تخترع أرقاماً غير موجودة في البيانات.`;

/**
 * Calls the AI sidecar with a focused reasoning task.
 *
 * Returns the text reply, or an empty string when the sidecar fails so the
 * caller can fall back to the deterministic statistical output gracefully.
 */
export async function llmReason(opts: LlmReasoningOptions): Promise<string> {
  const system = opts.systemPrompt ?? DEFAULT_SYSTEM;
  const sessionId = opts.sessionId ?? `ai-engine-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  const userMessage = `## البيانات\n${opts.dataContext}\n\n## المطلوب\n${opts.question}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(`${SIDECAR_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: userMessage }],
        session_id: sessionId,
        system,
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn({ status: resp.status, body: text.slice(0, 200) }, "AI sidecar returned non-2xx");
      return "";
    }
    const data = (await resp.json()) as { reply?: string };
    return (data.reply ?? "").trim();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "AI sidecar unreachable, falling back to statistics-only");
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// ─── Tiny in-process cache (TTL-based) ──────────────────────────────────────
// Avoids pounding the sidecar for the same prompt on rapid dashboard refresh.
// Stays in memory only; no Redis needed for MVP.

interface CacheEntry<T> { value: T; expiresAt: number }
const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { cache.delete(key); return null; }
  return hit.value as T;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function invalidateCache(prefix: string): void {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

import { Router, type Request, type Response } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { logger } from "../lib/logger.js";

const router = Router();

const AI_SIDECAR_URL = process.env.AI_SIDECAR_URL ?? "http://127.0.0.1:9000";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Proxy /api/ai/chat → Python sidecar (port 9000) that uses emergentintegrations + Claude Haiku.
 * The sidecar manages a per-session conversation history in memory.
 */
router.post("/ai/chat", authenticate, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { messages?: ChatMessage[]; session_id?: string };
  const messages = body.messages ?? [];

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  try {
    // Use the user's id as a stable session_id so the AI remembers conversation across requests
    const userId = req.user?.id ?? "anonymous";
    const sessionId = body.session_id ?? `user-${userId}`;

    const resp = await fetch(`${AI_SIDECAR_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, session_id: sessionId }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.warn({ status: resp.status, body: text.slice(0, 300) }, "AI sidecar error");

      // Detect budget-exceeded so the frontend can show a friendly message.
      const isBudget = /budget|exceeded|insufficient|quota/i.test(text);
      res.status(isBudget ? 402 : 502).json({
        error: isBudget
          ? "AI_BUDGET_EXCEEDED"
          : "AI service temporarily unavailable",
      });
      return;
    }

    const data = (await resp.json()) as { reply: string; session_id: string };
    res.json(data);
  } catch (err) {
    logger.error({ err }, "AI chat request failed");
    res.status(500).json({ error: "Failed to reach AI service" });
  }
});

export default router;

import { Router } from "express";
import { sseBroker } from "../lib/sse-broker.js";

const router = Router();

router.get("/events", (req, res): void => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`data: {"connected":true,"clients":${sseBroker.count + 1}}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(ping);
    }
  }, 25000);

  req.on("close", () => clearInterval(ping));

  sseBroker.addClient(res);
});

export default router;

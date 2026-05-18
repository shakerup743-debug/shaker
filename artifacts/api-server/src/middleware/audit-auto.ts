import { type Request, type Response, type NextFunction } from "express";
import { logAudit } from "../lib/audit.js";

const METHOD_TO_ACTION: Record<string, string> = {
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

function extractResource(url: string): { resource: string; resourceId?: string } {
  const clean = url.split("?")[0].replace(/^\/api\//, "");
  const parts = clean.split("/");
  const resource = parts[0] ?? "unknown";
  const resourceId = parts[1] && /^\d+$/.test(parts[1]) ? parts[1] : undefined;
  return { resource, resourceId };
}

const SKIP_PATHS = ["/api/auth/login", "/api/healthz", "/api/events", "/ws"];

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!METHOD_TO_ACTION[req.method]) {
    next();
    return;
  }
  if (SKIP_PATHS.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  const startBody = req.body as Record<string, unknown> | undefined;

  res.json = function (body: unknown) {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      const { resource, resourceId } = extractResource(req.path);
      const action = METHOD_TO_ACTION[req.method] ?? req.method.toLowerCase();

      const resolvedId =
        resourceId ??
        (body && typeof body === "object" && "id" in body
          ? String((body as { id: unknown }).id)
          : undefined);

      logAudit(req, action, resource, resolvedId, {
        method: req.method,
        path: req.path,
        requestBody: sanitizeBody(startBody),
      }).catch(() => {});
    }
    return originalJson(body);
  };

  next();
}

function sanitizeBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!body) return undefined;
  const safe = { ...body };
  for (const key of ["password", "token", "secret", "pin"]) {
    if (key in safe) safe[key] = "***";
  }
  return safe;
}

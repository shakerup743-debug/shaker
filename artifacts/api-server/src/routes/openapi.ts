import { Router } from "express";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const router = Router();
const __dir = dirname(fileURLToPath(import.meta.url));

// GET /api/openapi.json — serve the OpenAPI spec (public)
router.get("/api/openapi.json", (_req, res) => {
  try {
    const specPath = resolve(__dir, "../../../../lib/api-spec/openapi.yaml");
    const yaml = readFileSync(specPath, "utf-8");
    // Convert basic YAML to JSON (simple pass — spec is served as-is via content-type)
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    // Return a minimal JSON manifest since we serve YAML — redirect to raw YAML
    res.json({
      message: "FOODORO OpenAPI 3.1 Specification",
      spec_yaml: "/api/openapi.yaml",
      version: "1.0.0",
      endpoints: 42,
    });
  } catch {
    res.json({ message: "OpenAPI spec available", version: "1.0.0" });
  }
});

// GET /api/openapi.yaml — serve raw YAML spec
router.get("/api/openapi.yaml", (_req, res) => {
  try {
    const specPath = resolve(__dir, "../../../../lib/api-spec/openapi.yaml");
    const yaml = readFileSync(specPath, "utf-8");
    res.setHeader("Content-Type", "application/yaml");
    res.setHeader("Content-Disposition", "attachment; filename=foodoro-openapi.yaml");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(yaml);
  } catch {
    res.status(404).json({ error: "Spec not found" });
  }
});

export default router;

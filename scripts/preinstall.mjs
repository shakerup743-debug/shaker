#!/usr/bin/env node
/**
 * Cross-platform preinstall guard.
 *
 * Replaces the old `sh -c` script that broke on Windows. Does two things:
 *   1. Removes leftover npm/yarn lockfiles so they don't fight pnpm.
 *   2. Refuses to run unless the user is using pnpm.
 *
 * Works on Windows, macOS, Linux without any shell — only Node.js APIs.
 */
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
for (const f of ["package-lock.json", "yarn.lock"]) {
  const p = resolve(root, f);
  if (existsSync(p)) {
    try { unlinkSync(p); } catch { /* best-effort */ }
  }
}

const ua = process.env.npm_config_user_agent ?? "";
if (!ua.startsWith("pnpm/")) {
  console.error("\n[preinstall] This workspace requires pnpm. Install it with:");
  console.error("  npm install -g pnpm");
  console.error("Then run:  pnpm install\n");
  process.exit(1);
}

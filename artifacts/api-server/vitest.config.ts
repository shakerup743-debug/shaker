import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["__tests__/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
    },
  },
});

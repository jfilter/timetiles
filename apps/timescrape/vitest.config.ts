import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve from source, not dist — a stale build must never shadow current code in tests
    alias: { "@timetiles/shared": path.resolve(__dirname, "../../packages/shared/src") },
  },
  test: { globals: true, environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});

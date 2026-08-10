/**
 * @module
 */
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@timetiles/ui/charts": path.resolve(__dirname, "../../packages/ui/src/components/charts"),
      "@timetiles/ui/icons": path.resolve(__dirname, "../../packages/ui/src/components/icons"),
      "@timetiles/ui": path.resolve(__dirname, "../../packages/ui/src"),
      // Resolve from source, not dist — a stale build must never shadow current code in tests
      "@timetiles/shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
  },
});

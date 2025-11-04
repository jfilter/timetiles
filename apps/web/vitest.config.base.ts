/**
 * @module
 */
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@workspace/ui/charts": path.resolve(__dirname, "../../packages/ui/src/components/charts"),
      "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
    },
  },
});

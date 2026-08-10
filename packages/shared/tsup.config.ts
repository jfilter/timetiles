/**
 * Build configuration for the shared package (dual ESM+CJS with types).
 *
 * @module
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "./src/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  clean: true,
});

/**
 * Build configuration for the scraper SDK.
 *
 * @module
 * @category Config
 */
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "./src/index.ts", "cli/init": "./src/cli/init.ts" },
  // Dual-format on purpose: the exports map carries a `require` condition so
  // CommonJS scrapers can load the SDK, which needs a real CJS build behind it.
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  clean: true,
});

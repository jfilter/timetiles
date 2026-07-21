import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "./src/index.ts", "cli/init": "./src/cli/init.ts" },
  // Dual-format on purpose. An import-only exports map made `require()` fail
  // with ERR_PACKAGE_PATH_NOT_EXPORTED, silently excluding every CommonJS
  // scraper from the SDK; the map now carries a `require` condition, which
  // needs a real CJS build behind it.
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  clean: true,
});

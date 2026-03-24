import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "./src/index.ts", "cli/init": "./src/cli/init.ts" },
  format: ["esm"],
  dts: true,
  splitting: false,
  clean: true,
});

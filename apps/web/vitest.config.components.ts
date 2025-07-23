import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/unit/components/**/*.test.tsx"],
    setupFiles: ["tests/setup/components.ts"],
    testTimeout: 10000,
    pool: "forks",
  },
});

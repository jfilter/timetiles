import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import baseConfig from "./vitest.config.base";

export default defineConfig({
  ...baseConfig,
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["__tests__/components/**/*.{test,spec}.{js,ts,jsx,tsx}"],
    setupFiles: ["__tests__/setup-components.ts"],
    testTimeout: 10000,
    pool: "forks",
  },
});

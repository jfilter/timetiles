/**
 * @module
 */
import "@testing-library/jest-dom";

import { cleanup } from "@testing-library/react";

import { resetAppConfig } from "@/lib/config/app-config";
import { resetEnv } from "@/lib/config/env";

// Reset cached config before each test so vi.stubEnv() changes take effect
beforeEach(() => {
  resetEnv();
  resetAppConfig();
});

afterEach(() => {
  cleanup();
});

Object.defineProperty(globalThis, "matchMedia", {
  writable: true,
  value: vi
    .fn()
    .mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
});

import "../../mocks/external/next-intl";
import "../../mocks/external/next-navigation";

vi.mock("maplibre-gl", async () => {
  const mock = await import("../../mocks/external/maplibre-gl");
  return { default: mock.default, ...mock.default };
});

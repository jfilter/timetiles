/**
 * @module
 */
import "@testing-library/jest-dom";

import { cleanup } from "@testing-library/react";

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
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

// Import centralized mocks
import "../../mocks/external/next-navigation";

// Mock maplibre-gl
vi.mock("maplibre-gl", async () => {
  const mock = await import("../../mocks/external/maplibre-gl");
  return {
    default: mock.default,
    ...mock.default,
  };
});

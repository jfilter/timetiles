/**
 * Tests for embed-related middleware behavior.
 *
 * Verifies that embed routes receive permissive frame-ancestors headers
 * and non-embed routes receive restrictive X-Frame-Options headers.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

// --- Mocks ----------------------------------------------------------------

// Capture the function passed to createMiddleware so we can test the wrapper
const mockIntlResponse = { headers: new Map<string, string>() };

vi.mock("next-intl/middleware", () => ({ default: vi.fn(() => () => mockIntlResponse) }));

// Mock NextRequest with nextUrl.pathname
const createMockRequest = (pathname: string) => {
  return { nextUrl: { pathname } } as { nextUrl: { pathname: string } };
};

// --- Import after mocks ---------------------------------------------------

// The middleware wraps createMiddleware, so we need to import the default
// export which is the actual middleware function.
const { default: middleware } = await import("../../../middleware");

describe("middleware embed headers", () => {
  // Reset the mock response headers before each test
  const resetHeaders = () => {
    mockIntlResponse.headers = new Map<string, string>();
    // Provide Map-like interface expected by the middleware
    const store = mockIntlResponse.headers;
    const originalDelete = store.delete.bind(store);
    const originalSet = store.set.bind(store);
    const originalGet = store.get.bind(store);

    Object.assign(mockIntlResponse.headers, { delete: originalDelete, set: originalSet, get: originalGet });
  };

  describe("embed routes", () => {
    it.each(["/embed", "/embed/city-events", "/embed/city-events/", "/de/embed", "/de/embed/parks"])(
      "sets frame-ancestors * for %s",
      (pathname) => {
        resetHeaders();
        middleware(createMockRequest(pathname) as never);
        expect(mockIntlResponse.headers.get("Content-Security-Policy")).toBe("frame-ancestors *");
        expect(mockIntlResponse.headers.has("X-Frame-Options")).toBe(false);
      }
    );
  });

  describe("non-embed routes", () => {
    it.each(["/", "/explore", "/de/explore", "/login", "/dashboard", "/embedded-page"])(
      "sets X-Frame-Options DENY for %s",
      (pathname) => {
        resetHeaders();
        middleware(createMockRequest(pathname) as never);
        expect(mockIntlResponse.headers.get("X-Frame-Options")).toBe("DENY");
        expect(mockIntlResponse.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
      }
    );
  });
});

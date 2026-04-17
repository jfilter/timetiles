/**
 * Tests for the i18n middleware matcher configuration.
 *
 * Verifies that the middleware matcher pattern contains the correct
 * exclusions for API routes, Payload dashboard, and static assets.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

// Mock next-intl/middleware to avoid importing next/server in Node test env
vi.mock("next-intl/middleware", () => ({ default: vi.fn() }));

// Now safe to import — the default export is mocked, only config is real
const { config } = await import("../../../middleware");

describe("i18n middleware config", () => {
  it("exports a matcher config", () => {
    expect(config).toBeDefined();
    expect(config.matcher).toBeDefined();
    expect(Array.isArray(config.matcher)).toBe(true);
  });

  it("matches API routes explicitly", () => {
    expect(config.matcher).toContain("/api/:path*");
  });

  it("excludes Payload dashboard from matching", () => {
    expect(config.matcher.join(" ")).toContain("dashboard");
  });

  it("excludes Next.js internals from matching", () => {
    expect(config.matcher.join(" ")).toContain("_next");
    expect(config.matcher.join(" ")).toContain("_vercel");
  });

  it("excludes files with extensions from matching", () => {
    // The pattern .*\\..* matches files like favicon.ico, image.png
    expect(config.matcher.join(" ")).toContain("..");
  });
});

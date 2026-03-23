/**
 * Tests for embed utility functions.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import type { Site } from "@/payload-types";

import { isEmbedOriginAllowed } from "../../../../lib/utils/embed";

/** Helper to create a minimal site with allowed origins. */
const siteWithOrigins = (...origins: string[]) =>
  ({ embeddingConfig: { allowedOrigins: origins.map((origin) => ({ origin })) } }) as unknown as Site;

describe("isEmbedOriginAllowed", () => {
  describe("no restrictions", () => {
    it("allows when site is null", () => {
      expect(isEmbedOriginAllowed(null, "https://evil.com/page")).toBe(true);
    });

    it("allows when allowedOrigins is empty", () => {
      const site = { embeddingConfig: { allowedOrigins: [] } } as unknown as Site;
      expect(isEmbedOriginAllowed(site, "https://evil.com/page")).toBe(true);
    });

    it("allows when embeddingConfig is undefined", () => {
      const site = {} as unknown as Site;
      expect(isEmbedOriginAllowed(site, "https://evil.com/page")).toBe(true);
    });
  });

  describe("with restrictions", () => {
    const site = siteWithOrigins("https://example.com", "https://blog.example.com");

    it("allows matching origin", () => {
      expect(isEmbedOriginAllowed(site, "https://example.com/some/page")).toBe(true);
    });

    it("allows matching origin with port in referer", () => {
      const siteWithPort = siteWithOrigins("https://example.com:8080");
      expect(isEmbedOriginAllowed(siteWithPort, "https://example.com:8080/page")).toBe(true);
    });

    it("allows second listed origin", () => {
      expect(isEmbedOriginAllowed(site, "https://blog.example.com/article")).toBe(true);
    });

    it("rejects non-matching origin", () => {
      expect(isEmbedOriginAllowed(site, "https://evil.com/page")).toBe(false);
    });

    it("rejects different protocol", () => {
      expect(isEmbedOriginAllowed(site, "http://example.com/page")).toBe(false);
    });

    it("rejects subdomain mismatch", () => {
      expect(isEmbedOriginAllowed(site, "https://other.example.com/page")).toBe(false);
    });
  });

  describe("edge cases", () => {
    const site = siteWithOrigins("https://example.com");

    it("rejects null referer when origins are configured (prevents Referrer-Policy bypass)", () => {
      expect(isEmbedOriginAllowed(site, null)).toBe(false);
    });

    it("allows null referer when no origins are configured", () => {
      expect(isEmbedOriginAllowed(null, null)).toBe(true);
    });

    it("rejects invalid referer URL", () => {
      expect(isEmbedOriginAllowed(site, "not-a-url")).toBe(false);
    });
  });
});

/**
 * Tests for static security headers in next.config.mjs.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

describe("next config security headers", () => {
  it("applies the expected security headers globally", async () => {
    const { default: nextConfig } = await import("../../../next.config.mjs");
    if (!nextConfig.headers) {
      throw new Error("Expected next config to define headers()");
    }

    const headers = await nextConfig.headers();
    const flattenedHeaders = headers.flatMap((entry) => entry.headers);
    const securityEntry = headers.find((entry) =>
      entry.headers.some((header) => header.key === "Strict-Transport-Security")
    );

    expect(securityEntry).toMatchObject({ source: "/:path*" });
    expect(flattenedHeaders).toEqual(
      expect.arrayContaining([
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
      ])
    );
  });
});

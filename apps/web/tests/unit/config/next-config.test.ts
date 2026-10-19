/**
 * Tests for static security headers in next.config.mjs.
 *
 * @module
 * @category Tests
 */
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { describe, expect, it } from "vitest";

/** Resolves the headers next.config.mjs sets for a path; a later rule overrides an earlier key, as in Next. */
const resolveHeaders = async (pathname: string): Promise<Map<string, string>> => {
  const { default: nextConfig } = await import("../../../next.config.mjs");
  const resolved = new Map<string, string>();
  for (const rule of (await nextConfig.headers?.()) ?? []) {
    if (!new RegExp(buildCustomRoute("header", rule).regex).test(pathname)) continue;
    for (const { key, value } of rule.headers) resolved.set(key, value);
  }
  return resolved;
};

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

  // API routes bypass the proxy, so these come from the config alone.
  it.each(["/api/media/file/logo.svg", "/api/media/file/photo.png", "/api/ingest-files/file/data.csv"])(
    "sandboxes the uploaded file %s",
    async (pathname) => {
      const headers = await resolveHeaders(pathname);

      expect(headers.get("Content-Security-Policy")).toContain("sandbox");
      expect(headers.get("Content-Security-Policy")).toContain("default-src 'none'");
      expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(headers.get("X-Frame-Options")).toBe("DENY");
    }
  );

  it("denies framing of other API routes without sandboxing them", async () => {
    const headers = await resolveHeaders("/api/v1/events/file-counts");

    expect(headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});

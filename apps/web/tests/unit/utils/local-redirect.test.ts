/**
 * Unit tests for safe local redirect helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { getSafeLocalRedirectPath, isSafeLocalRedirectPath } from "@/lib/utils/local-redirect";

describe("isSafeLocalRedirectPath", () => {
  it("allows in-app absolute paths", () => {
    expect(isSafeLocalRedirectPath("/account/settings?tab=profile#email")).toBe(true);
  });

  it("rejects protocol-relative paths", () => {
    expect(isSafeLocalRedirectPath("//evil.example/phish")).toBe(false);
  });

  it("rejects backslash-prefixed host paths", () => {
    expect(isSafeLocalRedirectPath("/\\evil.example/phish")).toBe(false);
  });

  it("rejects non-root-relative values", () => {
    expect(isSafeLocalRedirectPath("https://evil.example/phish")).toBe(false);
    expect(isSafeLocalRedirectPath("account/settings")).toBe(false);
  });
});

describe("getSafeLocalRedirectPath", () => {
  it("returns the provided path when it is safe", () => {
    expect(getSafeLocalRedirectPath("/explore")).toBe("/explore");
  });

  it("falls back for missing or unsafe values", () => {
    expect(getSafeLocalRedirectPath(null)).toBe("/");
    expect(getSafeLocalRedirectPath("")).toBe("/");
    expect(getSafeLocalRedirectPath("//evil.example/phish")).toBe("/");
    expect(getSafeLocalRedirectPath("https://evil.example/phish")).toBe("/");
  });

  it("supports a custom fallback", () => {
    expect(getSafeLocalRedirectPath("https://evil.example/phish", "/login")).toBe("/login");
  });
});

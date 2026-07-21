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

/**
 * Browsers strip tab, LF and CR from a URL before parsing it. A target can
 * therefore look local to a prefix check and still navigate off-site: the
 * checks see `/<TAB>/evil.example`, the browser sees `//evil.example`.
 */
describe("isSafeLocalRedirectPath — characters browsers strip", () => {
  const TAB = String.fromCharCode(9);
  const LF = String.fromCharCode(10);
  const CR = String.fromCharCode(13);

  it.each([
    ["tab", `/${TAB}/evil.example/phish`],
    ["line feed", `/${LF}/evil.example/phish`],
    ["carriage return", `/${CR}/evil.example/phish`],
    ["repeated tabs", `/${TAB}${TAB}/evil.example/phish`],
    ["tab before a backslash", `/${TAB}\\evil.example/phish`],
  ])("rejects a target smuggling a host past the prefix check with %s", (_label, target) => {
    expect(isSafeLocalRedirectPath(target)).toBe(false);
    expect(getSafeLocalRedirectPath(target)).toBe("/");
  });

  it("still accepts ordinary in-app paths", () => {
    expect(isSafeLocalRedirectPath("/")).toBe(true);
    expect(isSafeLocalRedirectPath("/de/explore?tag=a&tag=b")).toBe(true);
    expect(isSafeLocalRedirectPath("/account/settings#security")).toBe(true);
    // An encoded slash is data inside the path, not a host separator.
    expect(isSafeLocalRedirectPath("/explore?next=%2Ffoo")).toBe(true);
  });
});

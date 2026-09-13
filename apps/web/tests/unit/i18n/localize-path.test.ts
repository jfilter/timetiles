/**
 * Unit tests for locale prefixing of hard navigation targets.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE } from "@/i18n/config";
import { localizePath } from "@/i18n/localize-path";

describe("localizePath", () => {
  it("keeps paths of the default locale unprefixed", () => {
    expect(localizePath("/", DEFAULT_LOCALE)).toBe("/");
    expect(localizePath("/account/imports", DEFAULT_LOCALE)).toBe("/account/imports");
  });

  it("prefixes other locales without a trailing slash on the home page", () => {
    expect(localizePath("/", "de")).toBe("/de");
    expect(localizePath("/account/imports", "de")).toBe("/de/account/imports");
  });

  it("does not prefix a path that already carries the locale", () => {
    expect(localizePath("/de", "de")).toBe("/de");
    expect(localizePath("/de/explore", "de")).toBe("/de/explore");
  });

  it("prefixes a path that only starts with the locale letters", () => {
    expect(localizePath("/demo", "de")).toBe("/de/demo");
  });
});

/**
 * Tests for i18n routing configuration.
 *
 * Verifies that the routing config, locale constants, and navigation
 * setup are correctly configured.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../../i18n/config";
import { routing } from "../../../i18n/routing";

describe("i18n routing config", () => {
  describe("locale constants", () => {
    it("supports en and de locales", () => {
      expect(SUPPORTED_LOCALES).toContain("en");
      expect(SUPPORTED_LOCALES).toContain("de");
      expect(SUPPORTED_LOCALES).toHaveLength(2);
    });

    it("has a valid default locale", () => {
      expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    });
  });

  describe("routing definition", () => {
    it("uses as-needed locale prefix strategy", () => {
      expect(routing.localePrefix).toBe("as-needed");
    });

    it("includes all supported locales", () => {
      expect(routing.locales).toEqual(expect.arrayContaining(["en", "de"]));
    });

    it("sets default locale from config", () => {
      expect(routing.defaultLocale).toBe(DEFAULT_LOCALE);
    });
  });
});

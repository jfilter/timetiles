/**
 * Tests for locale-aware language display names.
 *
 * Detection stores ISO 639-3 codes plus an English name; rendering that name meant
 * "Automatisch erkannt: German" under /de. These pin the code-based resolution instead.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it } from "vitest";

import { getLanguageName, UNDETERMINED_LANGUAGE_CODE } from "@/lib/utils/language-name";

describe("getLanguageName", () => {
  it("names a language in the viewer's locale", () => {
    expect(getLanguageName("deu", "de")).toBe("Deutsch");
    expect(getLanguageName("deu", "en")).toBe("German");
    expect(getLanguageName("eng", "de")).toBe("Englisch");
  });

  it("maps the ISO 639-3 codes the detector emits", () => {
    expect(getLanguageName("fra", "en")).toBe("French");
    expect(getLanguageName("nld", "en")).toBe("Dutch");
    expect(getLanguageName("por", "en")).toBe("Portuguese");
  });

  it("uses the fallback for the undetermined code", () => {
    // Intl.DisplayNames renders "und" as "root", which is worse than saying nothing.
    expect(getLanguageName(UNDETERMINED_LANGUAGE_CODE, "de", "Unbekannt")).toBe("Unbekannt");
    expect(getLanguageName(UNDETERMINED_LANGUAGE_CODE, "en")).toBe(UNDETERMINED_LANGUAGE_CODE);
  });

  it("falls back to the raw code for a language Intl cannot name", () => {
    expect(getLanguageName("zzz", "en")).toBe("zzz");
  });
});

/**
 * Unit tests for geocoding address normalization.
 *
 * The normalized form is BOTH the cache key and the string sent to the
 * geocoding providers, so it must preserve non-ASCII letters.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { normalizeGeocodingAddress } from "@/lib/services/geocoding/cache-manager";

describe("normalizeGeocodingAddress", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeGeocodingAddress("  123   MAIN St  ")).toBe("123 main st");
  });

  it("strips punctuation while keeping commas, dots, and dashes", () => {
    expect(normalizeGeocodingAddress("123 Main St!! (rear)")).toBe("123 main st rear");
    expect(normalizeGeocodingAddress("12-14 Long Rd., Springfield")).toBe("12-14 long rd., springfield");
  });

  // Regression: an ASCII-only \w class mangled every non-ASCII address —
  // providers received "mllerstrae 12, kln", fully non-Latin addresses
  // normalized to "" and were silently dropped from the geocode set, and
  // addresses differing only in non-ASCII letters collided on one cache key.
  it("preserves non-ASCII letters (umlauts, ß, accents)", () => {
    expect(normalizeGeocodingAddress("Müllerstraße 12, Köln")).toBe("müllerstraße 12, köln");
    expect(normalizeGeocodingAddress("Łódź, Polska")).toBe("łódź, polska");
  });

  it("preserves non-Latin scripts", () => {
    expect(normalizeGeocodingAddress("東京都新宿区")).toBe("東京都新宿区");
    expect(normalizeGeocodingAddress("Москва, Тверская 1")).toBe("москва, тверская 1");
  });

  it("keeps distinct keys for addresses differing only in non-ASCII letters", () => {
    expect(normalizeGeocodingAddress("Köln")).not.toBe(normalizeGeocodingAddress("Kln"));
  });

  it("collapses duplicate commas and trims leading/trailing separators", () => {
    expect(normalizeGeocodingAddress(",,Berlin,, Mitte,")).toBe("berlin, mitte");
  });
});

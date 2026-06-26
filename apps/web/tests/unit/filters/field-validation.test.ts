/**
 * Unit tests for event filter field-key validation.
 *
 * Guards the Unicode-awareness of VALID_FIELD_KEY_PATTERN: field keys are raw
 * CSV/JSON column headers, so localized (non-ASCII) headers must be accepted —
 * while SQL-significant characters stay rejected, since the key reaches SQL only
 * as a bound parameter.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { isValidFieldKey, MAX_FIELD_KEY_LENGTH } from "@/lib/filters/field-validation";

describe("isValidFieldKey", () => {
  it("accepts ASCII keys and nested dot-paths", () => {
    expect(isValidFieldKey("category")).toBe(true);
    expect(isValidFieldKey("meta.category")).toBe(true);
    expect(isValidFieldKey("a_b-c.d_2")).toBe(true);
  });

  it("accepts non-ASCII (Unicode) field keys from localized headers", () => {
    // Regression: an ASCII-only class silently dropped these from filters, sort,
    // and group-by — every German/CJK/Cyrillic-named column was unfilterable.
    expect(isValidFieldKey("Größe")).toBe(true);
    expect(isValidFieldKey("Straße")).toBe(true);
    expect(isValidFieldKey("meta.kategorie_ä")).toBe(true);
    expect(isValidFieldKey("категория")).toBe(true);
    expect(isValidFieldKey("種別")).toBe(true);
  });

  it("rejects keys with SQL-significant or whitespace characters", () => {
    for (const key of ["a b", "a'b", 'a"b', "a;b", "a,b", "a(b)", "a/b", ""]) {
      expect(isValidFieldKey(key)).toBe(false);
    }
  });

  it("rejects empty path segments and leading/trailing dots", () => {
    expect(isValidFieldKey(".a")).toBe(false);
    expect(isValidFieldKey("a.")).toBe(false);
    expect(isValidFieldKey("a..b")).toBe(false);
  });

  it("enforces max length and depth", () => {
    expect(isValidFieldKey("a".repeat(MAX_FIELD_KEY_LENGTH))).toBe(true);
    expect(isValidFieldKey("a".repeat(MAX_FIELD_KEY_LENGTH + 1))).toBe(false);
    expect(isValidFieldKey("a.b.c.d.e")).toBe(true); // depth 5 (MAX_FIELD_PATH_DEPTH)
    expect(isValidFieldKey("a.b.c.d.e.f")).toBe(false); // depth 6
  });
});

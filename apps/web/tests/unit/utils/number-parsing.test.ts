/**
 * Unit tests for locale-aware number parsing (per-column decimal/thousands).
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { classifyNumericFormat, decideNumberFormat, parseLocaleNumber } from "@/lib/utils/number-parsing";

const US = { decimalSeparator: "." as const, thousandsSeparator: "," as const };
const EU = { decimalSeparator: "," as const, thousandsSeparator: "." as const };

describe("classifyNumericFormat", () => {
  it("classifies plain integers", () => {
    expect(classifyNumericFormat("42")).toBe("plain");
    expect(classifyNumericFormat("-7")).toBe("plain");
  });

  it("classifies unambiguous US decimals (non-3-digit fraction or comma-thousands+dot-decimal)", () => {
    expect(classifyNumericFormat("1.5")).toBe("us");
    expect(classifyNumericFormat("1.23")).toBe("us");
    expect(classifyNumericFormat("1,234.56")).toBe("us");
    expect(classifyNumericFormat("1,234,567")).toBe("us"); // comma thousands
    expect(classifyNumericFormat("-1234.56")).toBe("us");
  });

  it("classifies unambiguous EU decimals (non-3-digit fraction or dot-thousands+comma-decimal)", () => {
    expect(classifyNumericFormat("1,5")).toBe("eu");
    expect(classifyNumericFormat("1,23")).toBe("eu");
    expect(classifyNumericFormat("1.234,56")).toBe("eu");
    expect(classifyNumericFormat("1.234.567")).toBe("eu"); // dot thousands
  });

  it("flags a single separator + exactly three trailing digits as ambiguous", () => {
    expect(classifyNumericFormat("1.234")).toBe("ambiguous");
    expect(classifyNumericFormat("1,234")).toBe("ambiguous");
  });

  it("rejects non-numeric and malformed values", () => {
    expect(classifyNumericFormat("")).toBeNull();
    expect(classifyNumericFormat("abc")).toBeNull();
    expect(classifyNumericFormat("2024-01-15")).toBeNull();
    expect(classifyNumericFormat("1.2.3")).toBeNull(); // 2-digit middle group, not valid grouping
  });
});

describe("decideNumberFormat", () => {
  it("resolves an EU column when any value is unambiguously EU", () => {
    // "1.234" alone is ambiguous, but "1,5" forces EU for the whole column.
    expect(decideNumberFormat(["1,5", "1.234"])).toEqual(EU);
  });

  it("resolves a US column when any value is unambiguously US", () => {
    expect(decideNumberFormat(["1.5", "1,234"])).toEqual(US);
  });

  it("defaults ambiguous-only and plain-only columns to US", () => {
    expect(decideNumberFormat(["1.234", "5.678"])).toEqual(US);
    expect(decideNumberFormat(["42", "99"])).toEqual(US);
  });

  it("returns null for a contradictory US+EU mix (refuses to guess)", () => {
    expect(decideNumberFormat(["1,5", "1.5"])).toBeNull();
  });

  it("ignores non-numeric values and decides from the numeric ones", () => {
    // "Berlin" is ignored; "1,5" forces EU. (The non-numeric value is caught
    // downstream as an invalid merge value, not here.)
    expect(decideNumberFormat(["1,5", "Berlin"])).toEqual(EU);
  });

  it("returns null when there are no numeric values at all", () => {
    expect(decideNumberFormat(["Berlin", "Munich"])).toBeNull();
    expect(decideNumberFormat([])).toBeNull();
  });
});

describe("parseLocaleNumber", () => {
  it("parses EU numbers under an EU format", () => {
    expect(parseLocaleNumber("1.234,56", EU)).toBe(1234.56);
    expect(parseLocaleNumber("1,5", EU)).toBe(1.5);
    expect(parseLocaleNumber("-1.234,5", EU)).toBe(-1234.5);
  });

  it("parses US numbers under a US format", () => {
    expect(parseLocaleNumber("1,234.56", US)).toBe(1234.56);
    expect(parseLocaleNumber("1.5", US)).toBe(1.5);
  });

  it("interprets the same ambiguous token differently per column convention", () => {
    expect(parseLocaleNumber("1.234", US)).toBe(1.234); // dot = decimal
    expect(parseLocaleNumber("1.234", EU)).toBe(1234); // dot = thousands
  });

  it("returns null for values that are not clean numbers under the format", () => {
    expect(parseLocaleNumber("abc", US)).toBeNull();
    expect(parseLocaleNumber("", EU)).toBeNull();
  });
});

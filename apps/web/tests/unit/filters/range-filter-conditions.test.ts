/**
 * Unit tests for numeric range filter SQL builder and sanitization.
 *
 * Covers `buildRangeFilterConditions` (locale-aware, null-safe `::numeric`
 * normalization) and `sanitizeRangeFilters` (key/bounds validation).
 *
 * @module
 * @category Tests
 */
const mocks = vi.hoisted(() => ({
  mockSqlJoin: vi.fn((parts: unknown[], separator: unknown) => ({ type: "join", parts, separator })),
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings: Array.from(strings), values }),
    { join: mocks.mockSqlJoin, raw: vi.fn((value: string) => ({ type: "raw", value })) }
  ),
}));

import { describe, expect, it, vi } from "vitest";

import { sanitizeRangeFilters } from "@/lib/filters/field-validation";
import { buildRangeFilterConditions } from "@/lib/filters/to-sql-conditions";
import type { NumberFormat } from "@/lib/utils/number-parsing";

/** Flatten a (possibly nested) mocked sql fragment to its emitted SQL text. */
const collectQueryStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap((item) => collectQueryStrings(item));
  if (typeof value === "string") return [value];
  if (value != null && typeof value === "object")
    return Object.values(value).flatMap((item) => collectQueryStrings(item));
  return [];
};

/** Flatten a mocked sql fragment to the scalar bound values that were interpolated. */
const collectNumbers = (value: unknown): number[] => {
  if (Array.isArray(value)) return value.flatMap((item) => collectNumbers(item));
  if (typeof value === "number") return [value];
  if (value != null && typeof value === "object") return Object.values(value).flatMap((item) => collectNumbers(item));
  return [];
};

/**
 * Flatten a mocked sql fragment to the string VALUES interpolated as bound params
 * (the `values` arrays only — NOT the static template `strings`). This is where
 * the thousands separator (`"."` / `","`) lands via `replace(x, ${sep}, '')`.
 */
const collectInterpolatedStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap((item) => collectInterpolatedStrings(item));
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Array.isArray(obj.values)
      ? obj.values.flatMap((item) => (typeof item === "string" ? [item] : collectInterpolatedStrings(item)))
      : [];
  }
  return [];
};

const US: NumberFormat = { decimalSeparator: ".", thousandsSeparator: "," };
const EU: NumberFormat = { decimalSeparator: ",", thousandsSeparator: "." };
const PLAIN: NumberFormat = { decimalSeparator: ".", thousandsSeparator: null };

describe("buildRangeFilterConditions", () => {
  it("returns no conditions when rangeFilters is undefined", () => {
    expect(buildRangeFilterConditions(undefined, {})).toEqual([]);
  });

  it("emits >= and <= conditions for a min+max range", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 10, max: 50 } }, { price: PLAIN });
    expect(conditions).toHaveLength(2);
    const text = collectQueryStrings(conditions).join(" ");
    expect(text).toContain(">= ");
    expect(text).toContain("<= ");
    expect(text).toContain("::numeric");
    expect(collectNumbers(conditions)).toEqual([10, 50]);
  });

  it("emits only a >= condition for a min-only range", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 10, max: null } }, { price: PLAIN });
    expect(conditions).toHaveLength(1);
    expect(collectQueryStrings(conditions).join(" ")).toContain(">= ");
    expect(collectNumbers(conditions)).toEqual([10]);
  });

  it("emits only a <= condition for a max-only range", () => {
    const conditions = buildRangeFilterConditions({ price: { min: null, max: 50 } }, { price: PLAIN });
    expect(conditions).toHaveLength(1);
    expect(collectQueryStrings(conditions).join(" ")).toContain("<= ");
    expect(collectNumbers(conditions)).toEqual([50]);
  });

  it("guards the cast with a numeric regex so non-numeric cells never throw", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 0 } }, { price: PLAIN });
    const text = collectQueryStrings(conditions).join(" ");
    // CASE / regex guard yields NULL for non-numeric text instead of casting it.
    expect(text).toContain("CASE WHEN ");
    expect(text).toContain("~ '^-?[0-9]+(\\.[0-9]+)?$'");
    expect(text).toContain("ELSE NULL END");
  });

  it("strips a US thousands separator (',') before casting", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 1000 } }, { price: US });
    const chunks = collectQueryStrings(conditions);
    // One replace() strips the ',' thousands separator; no comma->dot step for US.
    expect(chunks.some((c) => c.includes("replace("))).toBe(true);
    // The thousands separator value (',') is interpolated as a bound param.
    expect(collectInterpolatedStrings(conditions)).toContain(",");
    // No ',' -> '.' decimal-conversion fragment for a US column.
    expect(chunks.some((c) => c.includes("',', '.'"))).toBe(false);
  });

  it("normalizes an EU column: strip '.' thousands then convert ',' decimal to '.'", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 1234.56 } }, { price: EU });
    const chunks = collectQueryStrings(conditions);
    // The '.' thousands separator is interpolated as a bound param (replace(x, '.', '')).
    expect(collectInterpolatedStrings(conditions)).toContain(".");
    // The decimal-conversion fragment replace(x, ',', '.') is present.
    expect(chunks.some((c) => c.includes("',', '.'"))).toBe(true);
  });

  it("skips fields with no resolved NumberFormat (never casts blind)", () => {
    const conditions = buildRangeFilterConditions({ price: { min: 1 } }, {});
    expect(conditions).toEqual([]);
  });

  it("skips invalid field keys", () => {
    const conditions = buildRangeFilterConditions(
      { "invalid key with spaces": { min: 1 } },
      { "invalid key with spaces": PLAIN }
    );
    expect(conditions).toEqual([]);
  });

  it("skips ranges with neither finite min nor max", () => {
    const conditions = buildRangeFilterConditions({ price: { min: null, max: null } }, { price: PLAIN });
    expect(conditions).toEqual([]);
  });
});

describe("sanitizeRangeFilters", () => {
  it("keeps valid keys with at least one finite bound", () => {
    expect(sanitizeRangeFilters({ price: { min: 1, max: 5 } })).toEqual({ price: { min: 1, max: 5 } });
    expect(sanitizeRangeFilters({ price: { min: 1 } })).toEqual({ price: { min: 1, max: null } });
    expect(sanitizeRangeFilters({ price: { max: 5 } })).toEqual({ price: { min: null, max: 5 } });
  });

  it("drops entries with invalid field keys", () => {
    expect(sanitizeRangeFilters({ "bad key": { min: 1 } })).toEqual({});
  });

  it("drops entries with no usable bound", () => {
    expect(sanitizeRangeFilters({ price: { min: null, max: null } })).toEqual({});
    expect(sanitizeRangeFilters({ price: {} })).toEqual({});
  });

  it("drops entries where min exceeds max (defense-in-depth)", () => {
    expect(sanitizeRangeFilters({ price: { min: 100, max: 1 } })).toEqual({});
  });

  it("ignores non-finite bounds", () => {
    expect(sanitizeRangeFilters({ price: { min: Number.NaN, max: 5 } })).toEqual({ price: { min: null, max: 5 } });
    expect(sanitizeRangeFilters({ price: { min: Number.POSITIVE_INFINITY } })).toEqual({});
  });
});

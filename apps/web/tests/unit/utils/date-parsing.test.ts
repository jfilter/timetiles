/**
 * Unit tests for safe import-date parsing.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { isImportDateLike, parseImportDate, parseImportDateWithFormat } from "@/lib/utils/date-parsing";

const expectIso = (value: unknown, expected: string): void => {
  expect(parseImportDate(value as string | number | Date | null | undefined)?.toISOString()).toBe(expected);
};

describe("parseImportDate", () => {
  it("should accept valid Date objects and reject invalid Date objects", () => {
    const date = new Date("2024-06-15T10:30:00Z");
    expect(parseImportDate(date)).toBe(date);
    expect(parseImportDate(new Date("invalid"))).toBeNull();
  });

  it("should parse ISO date and datetime strings", () => {
    expectIso("2024-06-15", "2024-06-15T00:00:00.000Z");
    expectIso("2024-06-15T10:30:00Z", "2024-06-15T10:30:00.000Z");
  });

  it("should reject invalid ISO calendar dates", () => {
    expect(parseImportDate("2024-02-30")).toBeNull();
    expect(parseImportDate("2024-13-01")).toBeNull();
    expect(parseImportDate("2024/02/30")).toBeNull();
  });

  it("should parse known slash, dash, dot, and text-month date formats", () => {
    expectIso("03/15/2024", "2024-03-15T00:00:00.000Z");
    expectIso("15/03/2024", "2024-03-15T00:00:00.000Z");
    expectIso("15-03-2024", "2024-03-15T00:00:00.000Z");
    expectIso("15.03.2024", "2024-03-15T00:00:00.000Z");
    expectIso("15 March 2024", "2024-03-15T00:00:00.000Z");
    expectIso("March 15, 2024", "2024-03-15T00:00:00.000Z");
  });

  it("should parse bare years in the supported range", () => {
    expectIso("1898", "1898-01-01T00:00:00.000Z");
    expectIso(2024, "2024-01-01T00:00:00.000Z");
  });

  it("should reject numeric strings except bare 4-digit years", () => {
    expect(parseImportDate("39135")).toBeNull();
    expect(parseImportDate("16928")).toBeNull();
    expect(parseImportDate("1718451000000")).toBeNull();
    expect(parseImportDate("1e3")).toBeNull();
    expect(isImportDateLike("39135")).toBe(false);
  });

  it("should reject free text that JavaScript Date would parse accidentally", () => {
    expect(parseImportDate("Event 1")).toBeNull();
    expect(parseImportDate("Location 1")).toBeNull();
    expect(isImportDateLike("Location 1")).toBe(false);
  });

  it("should reject trusted HTTP dates in import auto-detection", () => {
    expect(parseImportDate("Wed, 21 Oct 2015 07:28:00 GMT")).toBeNull();
  });

  it("should parse numeric Unix timestamps only when passed as numbers", () => {
    expectIso(1_718_451_000, "2024-06-15T11:30:00.000Z");
    expectIso(1_718_451_000_000, "2024-06-15T11:30:00.000Z");
  });

  it("should reject finite numbers outside bare-year and Unix timestamp ranges", () => {
    expect(parseImportDate(999)).toBeNull();
    expect(parseImportDate(10_000)).toBeNull();
    expect(parseImportDate(39_135)).toBeNull();
  });
});

describe("parseImportDateWithFormat", () => {
  it("should parse known formats strictly and disambiguate slash dates", () => {
    expect(parseImportDateWithFormat("01/02/2024", "MM/DD/YYYY")?.toISOString()).toBe("2024-01-02T00:00:00.000Z");
    expect(parseImportDateWithFormat("01/02/2024", "DD/MM/YYYY")?.toISOString()).toBe("2024-02-01T00:00:00.000Z");
  });

  it("should reject values that do not match a known format", () => {
    expect(parseImportDateWithFormat("2024/03/15", "YYYY-MM-DD")).toBeNull();
  });

  it("should fall back to the safe parser for unknown legacy formats", () => {
    expect(parseImportDateWithFormat("2024-03-15T00:00:00Z", "UNKNOWN-FORMAT")?.toISOString()).toBe(
      "2024-03-15T00:00:00.000Z"
    );
    expect(parseImportDateWithFormat("39135", "UNKNOWN-FORMAT")).toBeNull();
  });
});

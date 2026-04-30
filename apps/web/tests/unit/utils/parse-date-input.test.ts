/**
 * Unit tests for parseDateInput date parsing.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { parseDateInput } from "@/lib/utils/date";

describe("parseDateInput", () => {
  it("should parse ISO date strings", () => {
    const result = parseDateInput("2024-06-15");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("should parse ISO datetime strings", () => {
    const result = parseDateInput("2024-06-15T10:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2024-06-15T10:30:00.000Z");
  });

  it("should parse trusted HTTP Expires dates", () => {
    const result = parseDateInput("Wed, 21 Oct 2015 07:28:00 GMT");
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2015-10-21T07:28:00.000Z");
  });

  it("should return null for null/undefined/empty", () => {
    expect(parseDateInput(null)).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("  ")).toBeNull();
  });

  it("should parse Unix timestamps in milliseconds", () => {
    const result = parseDateInput(1718451000000);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("should parse Unix timestamps in seconds", () => {
    const result = parseDateInput(1718451000);
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe("2024-06-15T11:30:00.000Z");
  });

  // This is the bug: a bare year like 1898 should be parsed as a year, not milliseconds
  it("should parse a bare 4-digit year as January 1st of that year", () => {
    const result = parseDateInput(1898);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(1898);
  });

  it("should parse year string as January 1st", () => {
    const result = parseDateInput("1898");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(1898);
  });

  it("should reject non-year numeric strings instead of treating them as large years", () => {
    expect(parseDateInput("39135")).toBeNull();
    expect(parseDateInput("16928")).toBeNull();
    expect(parseDateInput("1718451000000")).toBeNull();
  });

  it("should reject free text that JavaScript Date would parse accidentally", () => {
    expect(parseDateInput("Event 1")).toBeNull();
    expect(parseDateInput("Location 1")).toBeNull();
  });

  it("should parse year 2024 as a year, not milliseconds", () => {
    const result = parseDateInput(2024);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("should still parse large numbers as millisecond timestamps", () => {
    // 1718451000000 = 2024-06-15
    const result = parseDateInput(1718451000000);
    expect(result!.getFullYear()).toBe(2024);
  });

  it("should reject finite numbers outside supported year and Unix timestamp ranges", () => {
    expect(parseDateInput(999)).toBeNull();
    expect(parseDateInput(10000)).toBeNull();
    expect(parseDateInput(39135)).toBeNull();
  });
});

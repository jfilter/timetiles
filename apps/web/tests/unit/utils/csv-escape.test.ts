/**
 * Unit tests for CSV formula-injection escaping.
 *
 * Covers CSV column preservation and delimiter boundaries across streamed chunks.
 * Download-handler tests cover BOMs, separator directives, and SYLK neutralization.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { escapeCsvFormulaBoundaries, unparseRowsToCsv } from "@/lib/utils/csv-escape";

describe("unparseRowsToCsv", () => {
  const headerOf = (csv: string): string => csv.split(/\r?\n/)[0] ?? "";

  it("keeps fields absent from the first row (heterogeneous records)", () => {
    const csv = unparseRowsToCsv([{ a: "1" }, { a: "2", b: "3" }]);
    const cols = headerOf(csv).split(",");
    expect(cols).toContain("a");
    expect(cols).toContain("b");
    // The value unique to the second row survives (Papa.unparse(rows) alone would drop column b).
    expect(csv).toContain("3");
  });

  it("keeps a column missing from the first row (GeoJSON first-feature-without-geometry case)", () => {
    const csv = unparseRowsToCsv([{ name: "a" }, { name: "b", lat: 1, lng: 2 }]);
    const cols = headerOf(csv).split(",");
    expect(cols).toContain("lat");
    expect(cols).toContain("lng");
  });

  it("preserves first-seen column order across rows", () => {
    const csv = unparseRowsToCsv([{ a: "1", c: "2" }, { b: "3" }]);
    expect(headerOf(csv)).toBe("a,c,b");
  });

  it("handles a single row and empty input", () => {
    expect(headerOf(unparseRowsToCsv([{ x: "1" }]))).toBe("x");
    expect(unparseRowsToCsv([])).toBe("");
  });
});

describe("escapeCsvFormulaBoundaries", () => {
  it("chains correctly across streamed chunks via the carry", () => {
    // A boundary char at the end of one chunk + a trigger at the start of the
    // next must still be escaped.
    const first = escapeCsvFormulaBoundaries("a,");
    const second = escapeCsvFormulaBoundaries("=1+1", first.carry);
    expect(first.output + second.output).toBe("a,'=1+1");
  });
});

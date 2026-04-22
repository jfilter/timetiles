/**
 * Unit tests for CSV formula-injection escaping.
 *
 * Covers every OWASP-flagged leading character (=, +, -, @, TAB, CR) plus
 * negative cases (non-string values, empty strings, ISO dates, safe prefixes).
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { escapeCsvFormula, escapeRowFormulas, escapeRowsFormulas } from "@/lib/utils/csv-escape";

describe("escapeCsvFormula", () => {
  describe("escapes dangerous leading characters", () => {
    it.each([
      ["= formula", "=SUM(A1)", "'=SUM(A1)"],
      ["+ formula", "+cmd|'/C calc'!A0", "'+cmd|'/C calc'!A0"],
      ["- formula", "-1+1", "'-1+1"],
      ["@ formula", "@SUM(A1)", "'@SUM(A1)"],
      ["TAB prefix", "\tfoo", "'\tfoo"],
      ["CR prefix", "\rfoo", "'\rfoo"],
      ["bare =", "=", "'="],
      ["bare +", "+", "'+"],
      ["bare -", "-", "'-"],
      ["bare @", "@", "'@"],
      ["bare TAB", "\t", "'\t"],
      ["bare CR", "\r", "'\r"],
    ])("escapes %s", (_label, input, expected) => {
      expect(escapeCsvFormula(input)).toBe(expected);
    });

    it("escapes DDE payload", () => {
      // Classic DDE injection payload (CVE-2014-3524 family)
      const payload = '=cmd|"/c calc"!A0';
      expect(escapeCsvFormula(payload)).toBe(`'${payload}`);
    });

    it("escapes string '-42' (cannot distinguish from formula)", () => {
      // This is expected defensive behavior. Numeric fields should be typed
      // as numbers, not strings, to avoid the escape.
      expect(escapeCsvFormula("-42")).toBe("'-42");
    });
  });

  describe("passes through safe values", () => {
    it("leaves plain strings alone", () => {
      expect(escapeCsvFormula("hello world")).toBe("hello world");
    });

    it("leaves ISO dates alone (start with digit)", () => {
      expect(escapeCsvFormula("2024-01-15")).toBe("2024-01-15");
    });

    it("leaves ISO timestamps alone", () => {
      expect(escapeCsvFormula("2024-01-15T10:30:00Z")).toBe("2024-01-15T10:30:00Z");
    });

    it("leaves empty string alone", () => {
      expect(escapeCsvFormula("")).toBe("");
    });

    it("leaves string starting with whitespace alone", () => {
      // A single space is not in the formula-prefix set
      expect(escapeCsvFormula(" =SUM(A1)")).toBe(" =SUM(A1)");
    });

    it("leaves quoted strings alone", () => {
      expect(escapeCsvFormula('"hello"')).toBe('"hello"');
    });

    it("leaves strings starting with letters alone", () => {
      expect(escapeCsvFormula("Excel")).toBe("Excel");
    });
  });

  describe("passes through non-string values unchanged", () => {
    it("passes numbers through", () => {
      expect(escapeCsvFormula(42)).toBe(42);
      expect(escapeCsvFormula(-42)).toBe(-42);
      expect(escapeCsvFormula(0)).toBe(0);
      expect(escapeCsvFormula(3.14)).toBe(3.14);
    });

    it("passes booleans through", () => {
      expect(escapeCsvFormula(true)).toBe(true);
      expect(escapeCsvFormula(false)).toBe(false);
    });

    it("passes null through", () => {
      expect(escapeCsvFormula(null)).toBeNull();
    });

    it("passes undefined through", () => {
      expect(escapeCsvFormula(undefined)).toBeUndefined();
    });

    it("passes objects through", () => {
      const obj = { a: 1 };
      expect(escapeCsvFormula(obj)).toBe(obj);
    });

    it("passes arrays through", () => {
      const arr = [1, 2, 3];
      expect(escapeCsvFormula(arr)).toBe(arr);
    });
  });
});

describe("escapeRowFormulas", () => {
  it("escapes every dangerous string cell and passes others through", () => {
    const row = {
      name: "Berlin",
      formula: "=SUM(A1)",
      cmd: "+cmd|'/C calc'!A0",
      minus: "-1+1",
      at: "@SUM",
      tab: "\tfoo",
      cr: "\rfoo",
      population: 3_500_000,
      active: true,
      missing: null,
      nested: { city: "Berlin" },
    };

    const out = escapeRowFormulas(row);

    expect(out.name).toBe("Berlin");
    expect(out.formula).toBe("'=SUM(A1)");
    expect(out.cmd).toBe("'+cmd|'/C calc'!A0");
    expect(out.minus).toBe("'-1+1");
    expect(out.at).toBe("'@SUM");
    expect(out.tab).toBe("'\tfoo");
    expect(out.cr).toBe("'\rfoo");
    expect(out.population).toBe(3_500_000);
    expect(out.active).toBe(true);
    expect(out.missing).toBeNull();
    expect(out.nested).toEqual({ city: "Berlin" });
  });

  it("returns a new object (does not mutate input)", () => {
    const row = { a: "=BAD" };
    const out = escapeRowFormulas(row);
    expect(row.a).toBe("=BAD");
    expect(out.a).toBe("'=BAD");
    expect(out).not.toBe(row);
  });

  it("handles empty row", () => {
    expect(escapeRowFormulas({})).toEqual({});
  });

  it("preserves key order", () => {
    const row = { c: "1", a: "=BAD", b: "2" };
    expect(Object.keys(escapeRowFormulas(row))).toEqual(["c", "a", "b"]);
  });
});

describe("escapeRowsFormulas", () => {
  it("applies escaping across an array of rows", () => {
    const rows = [
      { name: "A", note: "=SUM(1)" },
      { name: "B", note: "safe" },
      { name: "C", note: "+cmd" },
    ];

    const out = escapeRowsFormulas(rows);

    expect(out).toHaveLength(3);
    expect(out[0]!.note).toBe("'=SUM(1)");
    expect(out[1]!.note).toBe("safe");
    expect(out[2]!.note).toBe("'+cmd");
  });

  it("returns empty array for empty input", () => {
    expect(escapeRowsFormulas([])).toEqual([]);
  });

  it("does not mutate input rows", () => {
    const rows = [{ v: "=BAD" }];
    escapeRowsFormulas(rows);
    expect(rows[0]!.v).toBe("=BAD");
  });
});

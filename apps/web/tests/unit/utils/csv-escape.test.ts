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

import {
  escapeCsvFormula,
  escapeCsvFormulaBoundaries,
  escapeCsvFormulasInText,
  escapeRowFormulas,
  escapeRowsFormulas,
  unparseRowsToCsv,
} from "@/lib/utils/csv-escape";

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

describe("escapeCsvFormulasInText", () => {
  const rowsOf = (csv: string): string[] => csv.split(/\r?\n/);

  it("prefixes an apostrophe to formula cells while leaving safe cells untouched", () => {
    const input = 'name,note\nAlice,=HYPERLINK("http://evil")\nBob,hello';
    const out = escapeCsvFormulasInText(input);
    // The dangerous cell is neutralized (quoted because it contains a comma/paren).
    expect(out).toContain("'=HYPERLINK");
    // Header and benign values are unchanged.
    expect(rowsOf(out)[0]).toBe("name,note");
    expect(out).toContain("Bob");
    expect(out).toContain("hello");
  });

  it("escapes the classic OWASP formula-trigger characters", () => {
    const input = "v\n=1+1\n+1\n-1\n@SUM\nplain";
    const out = escapeCsvFormulasInText(input);
    expect(out).toContain("'=1+1");
    expect(out).toContain("'+1");
    expect(out).toContain("'-1");
    expect(out).toContain("'@SUM");
    // A plain value keeps no apostrophe.
    expect(rowsOf(out).at(-1)).toBe("plain");
  });

  it("preserves row/column structure and returns '' for empty input", () => {
    const input = "a,b,c\n1,2,3\n4,5,6";
    const out = escapeCsvFormulasInText(input);
    expect(rowsOf(out)).toEqual(["a,b,c", "1,2,3", "4,5,6"]);
    expect(escapeCsvFormulasInText("")).toBe("");
  });

  it("escapes a formula in a SEMICOLON-delimited file (EU locale)", () => {
    const out = escapeCsvFormulasInText("name;value\nx;=1+1\n");
    expect(out).toContain("x;'=1+1");
    // Structure preserved verbatim (only an apostrophe inserted).
    expect(out).not.toContain("x,");
  });

  it("escapes a formula in a TAB-delimited file", () => {
    const out = escapeCsvFormulasInText("a\tb\nx\t=SUM(A1)\n");
    expect(out).toContain("\t'=SUM(A1)");
  });

  it("escapes an ambiguous file that both ',' and ';' could split (delimiter-agnostic)", () => {
    // Commas in the first field make ',' and ';' equally plausible; a delimiter
    // heuristic would pick ',' and miss the `;`-cell formula. The boundary scan
    // escapes the `=` because it follows a `;` regardless.
    const out = escapeCsvFormulasInText("first,last;formula\nx,y;=1+1\n");
    expect(out).toContain(";'=1+1");
  });

  it("escapes a formula that follows a boundary inside a quoted value (safe over-escape)", () => {
    // "x,=y" is technically one cell starting with 'x', but a semicolon/other
    // locale could still split it; the boundary scan escapes conservatively.
    const out = escapeCsvFormulasInText('a,b\n"x,=y",ok\n');
    expect(out).toContain(",'=y");
  });

  it("preserves a leading UTF-8 BOM at the file start", () => {
    const out = escapeCsvFormulasInText("﻿name,value\nx,=1+1\n");
    expect(out.startsWith("﻿name,value")).toBe(true);
    expect(out).toContain(",'=1+1");
  });

  it("escapes a formula that a stripped BOM would expose as the first cell", () => {
    // A spreadsheet drops the leading BOM, so `<BOM>=1+1` becomes cell A1 = =1+1.
    expect(escapeCsvFormulasInText("﻿=1+1,x")).toBe("﻿'=1+1,x");
    expect(escapeCsvFormulasInText('﻿"=1+1",x')).toBe('﻿"\'=1+1",x');
  });

  it("escapes formulas after RS/US separators that Papa also auto-detects", () => {
    expect(escapeCsvFormulasInText("name\x1fvalue\nx\x1f=1+1")).toContain("\x1f'=1+1");
    expect(escapeCsvFormulasInText("a\x1e=b")).toBe("a\x1e'=b");
  });

  it("honors an Excel sep= directive declaring an arbitrary delimiter", () => {
    // sep=: makes ':' the delimiter; the formula after it must be escaped.
    const out = escapeCsvFormulasInText('sep=:\nname:value\nx:"=HYPERLINK(""http://evil"")"');
    expect(out).toContain(":\"'=HYPERLINK");
    // A column named "separator..." must NOT be misread as a sep= directive.
    expect(escapeCsvFormulasInText("separator,x\n=1,y")).toContain("\n'=1,y");
  });

  it("escapes a formula opened with an apostrophe text-qualifier", () => {
    // Excel supports ' as a text qualifier and strips it → cell becomes =1+1.
    expect(escapeCsvFormulasInText("name,value\nx,'=1+1'")).toContain(",''=1+1");
  });

  it("chains correctly across streamed chunks via the carry", () => {
    // A boundary char at the end of one chunk + a trigger at the start of the
    // next must still be escaped.
    const first = escapeCsvFormulaBoundaries("a,");
    const second = escapeCsvFormulaBoundaries("=1+1", first.carry);
    expect(first.output + second.output).toBe("a,'=1+1");
  });
});

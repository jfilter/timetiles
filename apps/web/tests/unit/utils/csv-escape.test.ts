/**
 * Unit tests for CSV formula-injection escaping.
 *
 * Covers CSV column preservation, delimiter boundaries, streaming chunks,
 * BOM handling, separator directives, and SYLK neutralization.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  escapeCsvFormulaBoundaries,
  escapeCsvFormulasInText,
  unparseRowsToCsv,
  UTF8_BOM,
} from "@/lib/utils/csv-escape";

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
    const out = escapeCsvFormulasInText(`${UTF8_BOM}name,value\nx,=1+1\n`);
    expect(out.startsWith(`${UTF8_BOM}name,value`)).toBe(true);
    expect(out).toContain(",'=1+1");
  });

  it("escapes a formula that a stripped BOM would expose as the first cell", () => {
    // A spreadsheet drops the leading BOM, so `<BOM>=1+1` becomes cell A1 = =1+1.
    expect(escapeCsvFormulasInText(`${UTF8_BOM}=1+1,x`)).toBe(`${UTF8_BOM}'=1+1,x`);
    expect(escapeCsvFormulasInText(`${UTF8_BOM}"=1+1",x`)).toBe(`${UTF8_BOM}"'=1+1",x`);
  });

  it("escapes a formula after an embedded NUL that spreadsheets strip", () => {
    // Excel/Calc drop embedded NULs, so `x,\0=1+1` becomes a `=1+1` cell.
    expect(escapeCsvFormulasInText("name,value\nx,\x00=1+1")).toContain(",\x00'=1+1");
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

  it("honors a QUOTED sep= directive (LibreOffice Calc)", () => {
    const out = escapeCsvFormulasInText('"sep=:"\nname:value\nx:"=WEBSERVICE(""http://evil"")"');
    expect(out).toContain(":\"'=WEBSERVICE");
  });

  it("does NOT escape a trigger char that is itself the declared sep= separator", () => {
    // Empty fields and the directive must survive intact when sep is a trigger.
    expect(escapeCsvFormulasInText("sep=+\na++b")).toBe("sep=+\na++b");
    expect(escapeCsvFormulasInText("sep==\na==b")).toBe("sep==\na==b");
    // A real formula cell (trigger != separator) is still escaped.
    expect(escapeCsvFormulasInText("sep=+\na+=x")).toContain("+'=x");
  });

  it("neutralizes a SYLK-magic file (leading uppercase ID) that Excel would run", () => {
    const out = escapeCsvFormulasInText("ID;PSheetJS;N;E\nC;X1;K0;EWEBSERVICE(x)");
    expect(out.startsWith("'ID;")).toBe(true);
    // BOM is kept before the neutralizer.
    expect(escapeCsvFormulasInText(`${UTF8_BOM}ID;X`).startsWith(`${UTF8_BOM}'ID;`)).toBe(true);
    // A normal file NOT starting with ID is untouched.
    expect(escapeCsvFormulasInText("name,id\n1,2").startsWith("'")).toBe(false);
  });

  it("chains correctly across streamed chunks via the carry", () => {
    // A boundary char at the end of one chunk + a trigger at the start of the
    // next must still be escaped.
    const first = escapeCsvFormulaBoundaries("a,");
    const second = escapeCsvFormulaBoundaries("=1+1", first.carry);
    expect(first.output + second.output).toBe("a,'=1+1");
  });
});

import { describe, expect, it } from "vitest";

import { countCsvDataRows, countCsvRecords } from "../src/lib/csv.js";

describe("countCsvRecords", () => {
  it("counts header and data records", () => {
    expect(countCsvRecords("id,title\n1,A\n2,B\n")).toBe(3);
  });

  it("ignores the trailing newline and blank lines", () => {
    expect(countCsvRecords("id,title\n1,A\n\n\n")).toBe(2);
  });

  it("treats a quoted line break as part of one record", () => {
    // The bug this guards: counting raw lines reported 4 rows for a single
    // event whose description happened to span three lines.
    const csv = 'id,description\n1,"line one\nline two\nline three"\n';
    expect(countCsvRecords(csv)).toBe(2);
    expect(countCsvDataRows(csv)).toBe(1);
  });

  it("handles escaped quotes inside a quoted field", () => {
    const csv = 'id,title\n1,"He said ""hi""\nand left"\n2,B\n';
    expect(countCsvDataRows(csv)).toBe(2);
  });

  it("handles CRLF line endings", () => {
    expect(countCsvDataRows("id,title\r\n1,A\r\n2,B\r\n")).toBe(2);
  });

  it("handles a quoted CRLF inside a field", () => {
    expect(countCsvDataRows('id,text\r\n1,"a\r\nb"\r\n')).toBe(1);
  });

  it("reports zero data rows for a header-only document", () => {
    expect(countCsvDataRows("id,title\n")).toBe(0);
  });

  it("treats a quote inside an unquoted field as a literal character", () => {
    // Python's csv module and the import parser read `55" TV` as one field; a
    // quote only opens a quoted field at the start of that field.
    expect(countCsvDataRows('size,item\n55" TV,a\n12,b\n')).toBe(2);
    expect(countCsvDataRows('size"s,item\nA,B\n')).toBe(1);
  });

  it("reads consecutive quoted fields that each span lines as one record", () => {
    expect(countCsvDataRows('h1,h2,h3\n"x","y\n1","z\n2"\n')).toBe(1);
  });

  it("skips a record whose only field is a quoted empty string, as the import does", () => {
    expect(countCsvDataRows('title\r\nfirst\r\n""\r\nthird\r\n')).toBe(2);
    expect(countCsvDataRows('a,b\n"",""\n')).toBe(1);
    expect(countCsvDataRows('a,b\n""\n"x"\n')).toBe(1);
  });

  it("counts a record whose only field is whitespace", () => {
    expect(countCsvDataRows("title\r\nfirst\r\n \r\nthird\r\n")).toBe(3);
  });

  it("reports zero data rows for an empty document", () => {
    expect(countCsvRecords("")).toBe(0);
    expect(countCsvDataRows("")).toBe(0);
  });
});

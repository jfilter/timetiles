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

  it("reports zero data rows for an empty document", () => {
    expect(countCsvRecords("")).toBe(0);
    expect(countCsvDataRows("")).toBe(0);
  });
});

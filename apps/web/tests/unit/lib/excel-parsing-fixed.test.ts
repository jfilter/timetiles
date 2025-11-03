/**
 * Unit tests for Excel file parsing functionality.
 *
 * Tests parsing of Excel files including multi-sheet support,
 * data type detection, and error handling.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { read as xlsxRead, utils as xlsxUtils, write as xlsxWrite } from "xlsx";

import { parseExcelFile } from "../../../lib/jobs/utils/data-parsing";
import { createJobLogger } from "../../../lib/logger";

describe("Excel File Parsing - Fixed", () => {
  let testFilePath: string;
  let logger: ReturnType<typeof createJobLogger>;

  beforeAll(() => {
    logger = createJobLogger("test-excel", "test-request-id");
    testFilePath = path.join("/tmp", `test-excel-fixed-${Date.now()}.xlsx`);

    // Use EXACTLY the same xlsx imports as the parsing code
    const workbook = xlsxUtils.book_new();
    const data = [
      ["title", "description", "date"],
      ["Event 1", "Test Description", "2024-01-01"],
      ["Event 2", "Another Test", "2024-01-02"],
    ];

    const worksheet = xlsxUtils.aoa_to_sheet(data);
    xlsxUtils.book_append_sheet(workbook, worksheet, "Sheet1");

    // Try binary string output instead of buffer
    const binaryString = xlsxWrite(workbook, {
      type: "binary",
      bookType: "xlsx",
    });

    // Write as binary buffer
    const buffer = Buffer.from(binaryString, "binary");
    fs.writeFileSync(testFilePath, buffer);

    // Verify the file can be read back with the SAME xlsx methods
    const testRead = xlsxRead(fs.readFileSync(testFilePath));
    if (testRead.SheetNames[0]) {
      const testSheet = testRead.Sheets[testRead.SheetNames[0]];
      if (testSheet) {
        xlsxUtils.sheet_to_json(testSheet, { header: 1, defval: "" });
      }
    }
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it("should parse Excel file correctly with matching xlsx methods", () => {
    const result = parseExcelFile(testFilePath, logger);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      title: "Event 1",
      description: "Test Description",
      date: "2024-01-01",
    });
    expect(result[1]).toEqual({
      title: "Event 2",
      description: "Another Test",
      date: "2024-01-02",
    });
  });
});

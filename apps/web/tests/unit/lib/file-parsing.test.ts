/**
 * Unit tests for file parsing utilities.
 *
 * Feeds CSV and Excel files through the reader the import jobs use and checks
 * the rows they yield, including quoting, header and cell whitespace, and malformed input.
 *
 * @module
 * @category Tests
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { utils, write } from "xlsx";

import { cleanupSidecarFiles, streamBatchesFromFile } from "@/lib/ingest/file-readers";

import { getFixturePath } from "../../setup/paths";

describe("File Parsing", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-parsing-test-"));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  /** Read every row of a file through the reader the import jobs use. */
  const readRows = async (filePath: string, sheetIndex = 0): Promise<Record<string, unknown>[]> => {
    const rows: Record<string, unknown>[] = [];
    try {
      for await (const batch of streamBatchesFromFile(filePath, { batchSize: 100, sheetIndex })) {
        rows.push(...batch);
      }
    } finally {
      cleanupSidecarFiles(filePath, sheetIndex);
    }
    return rows;
  };

  const writeCsv = (name: string, content: string): string => {
    const csvPath = path.join(tempDir, name);
    fs.writeFileSync(csvPath, content, "utf8");
    return csvPath;
  };

  /** Write a one-sheet workbook from rows of cell values. */
  const writeWorkbook = (name: string, data: unknown[][]): string => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(data), "Sheet1");
    const filePath = path.join(tempDir, name);
    fs.writeFileSync(filePath, write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);
    return filePath;
  };

  describe("CSV Parsing", () => {
    it("reads the fixture CSV", async () => {
      const rows = await readRows(getFixturePath("valid-events.csv"));

      expect(rows).toHaveLength(6);
      expect(rows[0]).toEqual({
        title: "Tech Conference 2024",
        description: "Annual technology conference focusing on AI and machine learning",
        date: "2024-03-15",
        location: "Convention Center",
        category: "technology",
      });
    });

    it("unquotes fields and keeps embedded commas, quotes and non-ASCII text", async () => {
      const csvPath = writeCsv(
        "special.csv",
        `title,description,date
"Event with, comma","Description with ""quotes""","2024-03-15"
"Special chars: åéî","Normal description","2024-03-20"`
      );

      expect(await readRows(csvPath)).toEqual([
        { title: "Event with, comma", description: 'Description with "quotes"', date: "2024-03-15" },
        { title: "Special chars: åéî", description: "Normal description", date: "2024-03-20" },
      ]);
    });

    it("trims header names but keeps their case", async () => {
      const csvPath = writeCsv("headers.csv", `  TITLE  , Description ,  DATE  \n"Event 1","Desc 1","2024-03-15"`);

      expect(await readRows(csvPath)).toEqual([{ TITLE: "Event 1", Description: "Desc 1", DATE: "2024-03-15" }]);
    });

    it("skips empty lines without shifting later rows", async () => {
      const csvPath = writeCsv("empty-lines.csv", "title,date\nEvent 1,2024-03-15\n\nEvent 2,2024-03-16\n");

      expect(await readRows(csvPath)).toEqual([
        { title: "Event 1", date: "2024-03-15" },
        { title: "Event 2", date: "2024-03-16" },
      ]);
    });

    it("keeps reading the rows after a stray quote", async () => {
      const rows = await readRows(getFixturePath("malformed-data.csv"));

      expect(rows).toHaveLength(6);
      expect(rows[1]).toEqual({
        title: "Event with missing date",
        description: "This event has no date field",
        date: "",
        location: "Missing Location",
      });
      expect(rows[2]).toEqual({
        title: "Event with, comma",
        description: 'Description with "quotes"',
        date: "2024-03-20",
        location: "Normal Location",
      });
      expect(rows[5]).toEqual({
        title: "Valid Event",
        description: "Valid description",
        date: "invalid-date",
        location: "Valid Location",
      });
    });
  });

  describe("Excel Parsing", () => {
    it("reads the Excel fixture through the production reader", async () => {
      const rows = await readRows(getFixturePath("events.xlsx"));

      expect(rows).toHaveLength(4);
      expect(rows[0]).toMatchObject({
        title: "Conference 2024",
        description: "Technology conference",
        date: "2024-03-15",
        location: "Convention Center",
        category: "technology",
      });
    });

    it("reads a named sheet of the multi-sheet fixture through the production reader", async () => {
      const fixturePath = getFixturePath("multi-sheet.xlsx");
      // Sheet order is part of the fixture contract — the wizard addresses sheets by index.
      const rows = await readRows(fixturePath, 0);

      expect(rows[0]).toMatchObject({
        title: "AI Summit 2024",
        event_date: "2024-06-15",
        venue: "Tech Convention Center",
        city: "San Francisco, CA",
      });
    });

    it("streams Excel rows as objects through the production reader", async () => {
      // Goes through streamBatchesFromFile — the reader the import jobs use. A local
      // header/row conversion stood here before and claimed to be "the same logic",
      // while production converts the sheet to a CSV sidecar and keeps header case.
      const workbook = utils.book_new();
      const worksheetData = [
        ["Title", "Description", "Date", "Location"],
        ["Tech Conference 2024", "Annual technology conference", "2024-03-15", "Convention Center"],
        ["Art Gallery Opening", "Contemporary art exhibition", "2024-03-20", "Modern Art Gallery"],
      ];
      const worksheet = utils.aoa_to_sheet(worksheetData);
      utils.book_append_sheet(workbook, worksheet, "Sheet1");

      // Own directory: the shared tempDir is torn down by the afterEach of any
      // sibling test, and the suites in this file run concurrently.
      const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-parsing-xlsx-"));
      const filePath = path.join(ownDir, "events.xlsx");
      fs.writeFileSync(filePath, write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);

      const rows: Record<string, unknown>[] = [];
      try {
        for await (const batch of streamBatchesFromFile(filePath, { batchSize: 10 })) {
          rows.push(...batch);
        }
      } finally {
        cleanupSidecarFiles(filePath);
        fs.rmSync(ownDir, { recursive: true, force: true });
      }

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        Title: "Tech Conference 2024",
        Description: "Annual technology conference",
        Date: "2024-03-15",
        Location: "Convention Center",
      });
      expect(rows[1]).toMatchObject({ Title: "Art Gallery Opening", Location: "Modern Art Gallery" });
    });

    it("yields no rows for an empty Excel sheet", async () => {
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.aoa_to_sheet([]), "Empty");

      const ownDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-parsing-empty-"));
      const filePath = path.join(ownDir, "empty.xlsx");
      fs.writeFileSync(filePath, write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);

      try {
        expect(await readRows(filePath)).toHaveLength(0);
      } finally {
        fs.rmSync(ownDir, { recursive: true, force: true });
      }
    });
  });

  describe("Cell values", () => {
    it("delivers whitespace-only CSV cells as empty strings", async () => {
      const csvPath = writeCsv("whitespace.csv", 'title,date\n   ,2024-03-16\nAnother Event,"  \t  "\n');

      expect(await readRows(csvPath)).toEqual([
        { title: "", date: "2024-03-16" },
        { title: "Another Event", date: "" },
      ]);
    });

    it("delivers empty, numeric and boolean Excel cells as text", async () => {
      const filePath = writeWorkbook("types.xlsx", [
        ["title", "price", "flag"],
        [123, 25.99, true],
        [null, 0, false],
      ]);

      expect(await readRows(filePath)).toEqual([
        { title: "123", price: "25.99", flag: "TRUE" },
        { title: "", price: "0", flag: "FALSE" },
      ]);
    });
  });
});

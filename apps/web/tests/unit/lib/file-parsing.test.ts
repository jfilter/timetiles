/**
 * Unit tests for file parsing utilities.
 *
 * Tests CSV and Excel file parsing, including data extraction,
 * type conversion, and error handling for malformed files.
 *
 * @module
 * @category Tests
 */
// No mocking needed - use real file parsing libraries
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Papa from "papaparse";
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

  describe("CSV Parsing", () => {
    it("should parse fixture CSV file successfully", () => {
      // Use fixture file instead of creating inline content
      const fixturePath = getFixturePath("valid-events.csv");
      const fileContent = fs.readFileSync(fixturePath, "utf8");
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      expect(parseResult.data).toHaveLength(6);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.data[0]).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference focusing on AI and machine learning",
        date: "2024-03-15",
        location: "Convention Center",
        category: "technology",
      });
    });

    it("should parse CSV content successfully", () => {
      const csvContent = `title,description,date
"Tech Conference 2024","Annual technology conference","2024-03-15"
"Art Gallery Opening","Contemporary art exhibition","2024-03-20"`;
      const csvPath = path.join(tempDir, "test.csv");

      // Write real CSV file
      fs.writeFileSync(csvPath, csvContent, "utf8");

      // Read and parse real file
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.data[0]).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        date: "2024-03-15",
      });
      expect(parseResult.data[1]).toMatchObject({
        title: "Art Gallery Opening",
        description: "Contemporary art exhibition",
        date: "2024-03-20",
      });
    });

    it("should handle CSV with special characters and commas", () => {
      const csvContent = `title,description,date
"Event with, comma","Description with ""quotes""","2024-03-15"
"Special chars: åéî","Normal description","2024-03-20"`;
      const csvPath = path.join(tempDir, "special.csv");

      fs.writeFileSync(csvPath, csvContent, "utf8");
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.data[0]).toMatchObject({
        title: "Event with, comma",
        description: 'Description with "quotes"',
        date: "2024-03-15",
      });
      expect(parseResult.data[1]).toMatchObject({
        title: "Special chars: åéî",
        description: "Normal description",
        date: "2024-03-20",
      });
    });

    it("should handle malformed CSV gracefully", () => {
      const invalidCsvContent = `title,description,date
"Unclosed quote event,"Description","2024-03-15"
"Valid Event","Valid Description","2024-03-20"`;
      const csvPath = path.join(tempDir, "invalid.csv");

      fs.writeFileSync(csvPath, invalidCsvContent, "utf8");
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

      // Papa.parse is quite forgiving, should still get some data
      expect(parseResult.data.length).toBeGreaterThan(0);

      // The valid row should parse correctly
      const validRow = parseResult.data.find((row: any) => row.title?.includes("Valid Event"));
      expect(validRow).toBeDefined();
    });

    it("should handle malformed fixture CSV gracefully", () => {
      // Use malformed data fixture
      const fixturePath = getFixturePath("malformed-data.csv");
      const fileContent = fs.readFileSync(fixturePath, "utf8");
      const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

      // Should still get some data despite malformed entries
      expect(parseResult.data.length).toBeGreaterThan(0);

      // Should find the valid event
      const validRow = parseResult.data.find((row: any) => row.title?.includes("Valid Event"));
      expect(validRow).toBeDefined();
    });

    it("should transform headers correctly", () => {
      const csvContent = `  TITLE  , Description ,  DATE  
"Event 1","Desc 1","2024-03-15"`;
      const csvPath = path.join(tempDir, "headers.csv");

      fs.writeFileSync(csvPath, csvContent, "utf8");
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      expect(parseResult.data).toHaveLength(1);
      expect(parseResult.data[0]).toHaveProperty("title");
      expect(parseResult.data[0]).toHaveProperty("description");
      expect(parseResult.data[0]).toHaveProperty("date");
    });

    it("should skip empty lines", () => {
      const csvContent = `title,date
Event 1,2024-03-15

Event 2,2024-03-16
`;
      const csvPath = path.join(tempDir, "empty-lines.csv");

      fs.writeFileSync(csvPath, csvContent, "utf8");
      const fileContent = fs.readFileSync(csvPath, "utf8");
      const parseResult = Papa.parse(fileContent, { header: true, skipEmptyLines: true });

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.data[0]).toMatchObject({ title: "Event 1", date: "2024-03-15" });
      expect(parseResult.data[1]).toMatchObject({ title: "Event 2", date: "2024-03-16" });
    });
  });

  describe("Excel Parsing", () => {
    /** Read every row of a sheet through the reader the import jobs use. */
    const readSheetRows = async (filePath: string, sheetIndex = 0): Promise<Record<string, unknown>[]> => {
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

    it("reads the Excel fixture through the production reader", async () => {
      const rows = await readSheetRows(getFixturePath("events.xlsx"));

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
      const rows = await readSheetRows(fixturePath, 0);

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
        expect(await readSheetRows(filePath)).toHaveLength(0);
      } finally {
        fs.rmSync(ownDir, { recursive: true, force: true });
      }
    });
  });

  describe("Data Validation", () => {
    it("should identify required fields", () => {
      const requiredFields = ["title", "date"];
      const testData = [
        { title: "Valid Event", date: "2024-03-15", location: "Test Location" },
        { title: "", date: "2024-03-16", location: "Test Location" }, // Missing title
        { title: "Another Event", date: "", location: "Test Location" }, // Missing date
        { title: "Valid Event 2", date: "2024-03-17", location: "" }, // Missing optional field
      ];

      const validRows = testData.filter((row) => {
        return requiredFields.every((field) => row[field as keyof typeof row]?.toString().trim());
      });

      expect(validRows).toHaveLength(2);
      expect(validRows[0]?.title).toBe("Valid Event");
      expect(validRows[1]?.title).toBe("Valid Event 2");
    });

    it("should handle whitespace-only values as invalid", () => {
      const requiredFields = ["title", "date"];
      const testData = [
        { title: "Valid Event", date: "2024-03-15" },
        { title: "   ", date: "2024-03-16" }, // Whitespace-only title
        { title: "Another Event", date: "  \t  " }, // Whitespace-only date
      ];

      const validRows = testData.filter((row) => {
        return requiredFields.every((field) => row[field as keyof typeof row]?.toString().trim());
      });

      expect(validRows).toHaveLength(1);
      expect(validRows[0]?.title).toBe("Valid Event");
    });

    it("should handle null and undefined values", () => {
      const requiredFields = ["title", "date"];
      const testData = [
        { title: "Valid Event", date: "2024-03-15" },
        { title: null, date: "2024-03-16" },
        { title: "Another Event", date: undefined },
        { title: undefined, date: null },
      ];

      const validRows = testData.filter((row) => {
        return requiredFields.every((field) => row[field as keyof typeof row]?.toString().trim());
      });

      expect(validRows).toHaveLength(1);
      expect(validRows[0]?.title).toBe("Valid Event");
    });

    it("should validate different data types", () => {
      const testData = [
        { title: "String Event", date: "2024-03-15", price: "25.99" },
        { title: 123, date: new Date("2024-03-15"), price: 25.99 },
        { title: true, date: 44927, price: 0 }, // Boolean title, Excel date serial
      ];

      // All should be valid since they can be converted to strings
      const validRows = testData.filter((row) => {
        return ["title", "date"].every((field) => row[field as keyof typeof row]?.toString().trim());
      });

      expect(validRows).toHaveLength(3);
      expect(validRows[1]?.title.toString()).toBe("123");
      expect(validRows[2]?.title.toString()).toBe("true");
    });
  });
});

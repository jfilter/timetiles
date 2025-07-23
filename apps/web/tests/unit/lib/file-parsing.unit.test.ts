// No mocking needed - use real file parsing libraries
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import path from "path";
import os from "os";
import type { Event, Dataset } from "../../../payload-types";

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
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      // Papa.parse is quite forgiving, should still get some data
      expect(parseResult.data.length).toBeGreaterThan(0);

      // The valid row should parse correctly
      const validRow = parseResult.data.find((row: any) =>
        row.title?.includes("Valid Event"),
      );
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
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
      });

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.data[0]).toMatchObject({
        title: "Event 1",
        date: "2024-03-15",
      });
      expect(parseResult.data[1]).toMatchObject({
        title: "Event 2",
        date: "2024-03-16",
      });
    });
  });

  describe("Excel Parsing", () => {
    it("should parse Excel content successfully", () => {
      // Create a real Excel workbook in memory
      const workbook = XLSX.utils.book_new();
      const worksheetData = [
        ["title", "description", "date"],
        ["Conference 2024", "Tech event", "2024-03-15"],
        ["Art Show", "Gallery opening", "2024-03-20"],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

      // Write to buffer instead of file
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      // Read from buffer (simulating real file reading)
      const readWorkbook = XLSX.read(excelBuffer, { type: "buffer" });
      const sheetName = readWorkbook.SheetNames[0];
      const readWorksheet = readWorkbook.Sheets[sheetName!];
      const jsonData = XLSX.utils.sheet_to_json(readWorksheet!, {
        header: 1,
        defval: "",
      });

      expect(jsonData).toHaveLength(3);
      expect(jsonData[0]).toEqual(["title", "description", "date"]);
      expect(jsonData[1]).toEqual([
        "Conference 2024",
        "Tech event",
        "2024-03-15",
      ]);
      expect(jsonData[2]).toEqual([
        "Art Show",
        "Gallery opening",
        "2024-03-20",
      ]);
    });

    it("should handle Excel files with multiple sheets", () => {
      const workbook = XLSX.utils.book_new();

      // Add multiple sheets
      const sheet1Data = [
        ["title", "date"],
        ["Event 1", "2024-03-15"],
      ];
      const sheet2Data = [
        ["name", "location"],
        ["Event 2", "New York"],
      ];

      const worksheet1 = XLSX.utils.aoa_to_sheet(sheet1Data);
      const worksheet2 = XLSX.utils.aoa_to_sheet(sheet2Data);

      XLSX.utils.book_append_sheet(workbook, worksheet1, "Events");
      XLSX.utils.book_append_sheet(workbook, worksheet2, "Locations");

      // Write to buffer and read back
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });
      const readWorkbook = XLSX.read(excelBuffer, { type: "buffer" });

      expect(readWorkbook.SheetNames).toHaveLength(2);
      expect(readWorkbook.SheetNames).toContain("Events");
      expect(readWorkbook.SheetNames).toContain("Locations");

      // Parse first sheet
      const firstSheet = readWorkbook.Sheets[readWorkbook.SheetNames[0]!];
      const firstSheetData = firstSheet
        ? XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
        : [];
      expect(firstSheetData[0]).toEqual(["title", "date"]);
      expect(firstSheetData[1]).toEqual(["Event 1", "2024-03-15"]);
    });

    it("should convert Excel data to object format", () => {
      const workbook = XLSX.utils.book_new();
      const worksheetData = [
        ["Title", "Description", "Date", "Location"],
        [
          "Tech Conference 2024",
          "Annual technology conference",
          "2024-03-15",
          "Convention Center",
        ],
        [
          "Art Gallery Opening",
          "Contemporary art exhibition",
          "2024-03-20",
          "Modern Art Gallery",
        ],
      ];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

      // Write to buffer and read back
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });
      const readWorkbook = XLSX.read(excelBuffer, { type: "buffer" });
      const sheetName = readWorkbook.SheetNames[0];
      const readWorksheet = readWorkbook.Sheets[sheetName!];
      const rawData = readWorksheet
        ? XLSX.utils.sheet_to_json(readWorksheet, {
            header: 1,
            defval: "",
          })
        : ([] as any[]);

      // Convert to object format (same logic as in import jobs)
      const headers = (rawData[0] as string[]).map((h) =>
        h.toString().trim().toLowerCase(),
      );
      const parsedData = rawData.slice(1).map((row: any[]) => {
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] || "";
        });
        return obj;
      });

      expect(parsedData).toHaveLength(2);
      expect(parsedData[0]).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        date: "2024-03-15",
        location: "Convention Center",
      });
      expect(parsedData[1]).toMatchObject({
        title: "Art Gallery Opening",
        description: "Contemporary art exhibition",
        date: "2024-03-20",
        location: "Modern Art Gallery",
      });
    });

    it("should handle empty Excel files", () => {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Empty");

      // Write to buffer and read back
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });
      const readWorkbook = XLSX.read(excelBuffer, { type: "buffer" });
      const sheetName = readWorkbook.SheetNames[0];
      const readWorksheet = readWorkbook.Sheets[sheetName!];
      const jsonData = XLSX.utils.sheet_to_json(readWorksheet!, {
        header: 1,
        defval: "",
      });

      expect(jsonData).toHaveLength(0);
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
        return requiredFields.every(
          (field) =>
            row[field as keyof typeof row] &&
            row[field as keyof typeof row]?.toString().trim(),
        );
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
        return requiredFields.every(
          (field) =>
            row[field as keyof typeof row] &&
            row[field as keyof typeof row]?.toString().trim(),
        );
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
        return requiredFields.every(
          (field) =>
            row[field as keyof typeof row] &&
            row[field as keyof typeof row]?.toString().trim(),
        );
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
        return ["title", "date"].every(
          (field) =>
            row[field as keyof typeof row] &&
            row[field as keyof typeof row]?.toString().trim(),
        );
      });

      expect(validRows).toHaveLength(3);
      expect(validRows[1]?.title.toString()).toBe("123");
      expect(validRows[2]?.title.toString()).toBe("true");
    });
  });

  describe("Column Detection", () => {
    it("should detect common column variations", () => {
      const testHeaders = [
        "title",
        "event_name",
        "name",
        "description",
        "date",
        "start_date",
        "location",
        "venue",
        "url",
        "category",
        "tags",
      ];

      // Function to detect column mappings
      const detectColumns = (headers: string[]) => {
        const mapping: Record<string, string> = {};
        const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

        // Title variations
        const titleVariations = ["title", "event_name", "name", "event_title"];
        const titleMatch = lowerHeaders.find((h) =>
          titleVariations.includes(h),
        );
        if (titleMatch) mapping.title = titleMatch;

        // Date variations
        const dateVariations = ["date", "start_date", "event_date", "when"];
        const dateMatch = lowerHeaders.find((h) => dateVariations.includes(h));
        if (dateMatch) mapping.date = dateMatch;

        // Location variations
        const locationVariations = ["location", "venue", "place", "where"];
        const locationMatch = lowerHeaders.find((h) =>
          locationVariations.includes(h),
        );
        if (locationMatch) mapping.location = locationMatch;

        return mapping;
      };

      const mapping = detectColumns(testHeaders);

      expect(mapping.title).toBe("title");
      expect(mapping.date).toBe("date");
      expect(mapping.location).toBe("location");
    });

    it("should handle case-insensitive column detection", () => {
      const testHeaders = ["TITLE", "Description", "START_DATE", "LOCATION"];

      const detectColumns = (headers: string[]) => {
        const mapping: Record<string, string> = {};
        const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

        const titleVariations = ["title", "event_name", "name"];
        const titleMatch = lowerHeaders.find((h) =>
          titleVariations.includes(h),
        );
        if (titleMatch) {
          const originalIndex = lowerHeaders.indexOf(titleMatch);
          if (originalIndex !== -1) {
            mapping.title = headers[originalIndex]!;
          }
        }

        return mapping;
      };

      const mapping = detectColumns(testHeaders);
      expect(mapping.title).toBe("TITLE");
    });

    it("should prioritize exact matches over partial matches", () => {
      const testHeaders = ["event_title", "title", "title_description"];

      const detectColumns = (headers: string[]) => {
        const mapping: Record<string, string> = {};
        const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

        // Prioritize exact match
        const titleVariations = ["title", "event_title", "name"];
        for (const variation of titleVariations) {
          const match = lowerHeaders.find((h) => h === variation);
          if (match) {
            const originalIndex = lowerHeaders.indexOf(match);
            mapping.title = headers[originalIndex]!;
            break;
          }
        }

        return mapping;
      };

      const mapping = detectColumns(testHeaders);
      expect(mapping.title).toBe("title"); // Should prefer exact "title" over "event_title"
    });
  });
});

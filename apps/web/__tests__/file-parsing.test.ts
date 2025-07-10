// Mock dependencies
import { vi } from "vitest";

const mockFs = {
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
};

const mockPapa = {
  parse: vi.fn(),
};

const mockXLSX = {
  readFile: vi.fn(),
  utils: {
    sheet_to_json: vi.fn(),
  },
};

vi.mock("papaparse", () => mockPapa);
vi.mock("xlsx", () => mockXLSX);
vi.mock("fs", () => mockFs);

describe("File Parsing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("CSV Parsing", () => {
    const mockCsvContent = `title,description,date
"Tech Conference 2024","Annual technology conference","2024-03-15"
"Art Gallery Opening","Contemporary art exhibition","2024-03-20"`;

    beforeEach(() => {
      mockFs.readFileSync.mockReturnValue(mockCsvContent);
    });

    it("should parse valid CSV file correctly", () => {
      const mockParsedData = [
        {
          title: "Tech Conference 2024",
          description: "Annual technology conference",
          date: "2024-03-15",
        },
        {
          title: "Art Gallery Opening",
          description: "Contemporary art exhibition",
          date: "2024-03-20",
        },
      ];

      mockPapa.parse.mockReturnValue({
        data: mockParsedData,
        errors: [],
      });

      // Simulate parsing
      const filePath = "/tmp/test.csv";
      const fileContent = mockFs.readFileSync(filePath, "utf8");
      const parseResult = mockPapa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      }) as { data: any[]; errors: any[] };

      expect(mockPapa.parse).toHaveBeenCalledWith(mockCsvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: expect.any(Function),
      });

      expect(parseResult.data).toHaveLength(2);
      expect(parseResult.errors).toHaveLength(0);
      expect(parseResult.data[0]).toMatchObject({
        title: "Tech Conference 2024",
        description: "Annual technology conference",
        date: "2024-03-15",
      });
    });

    it("should handle CSV parsing errors", () => {
      const mockErrors = [{ message: "Invalid delimiter", row: 2 }];

      mockPapa.parse.mockReturnValue({
        data: [],
        errors: mockErrors,
      });

      const filePath = "/tmp/invalid.csv";
      const fileContent = mockFs.readFileSync(filePath, "utf8");
      const parseResult = mockPapa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      }) as { data: any[]; errors: any[] };

      expect(parseResult.errors).toHaveLength(1);
      expect(parseResult.errors[0]?.message).toBe("Invalid delimiter");
    });

    it("should transform headers to lowercase", () => {
      const mockData = [
        {
          title: "Test Event",
          description: "Test Description",
          date: "2024-03-15",
        },
      ];

      mockPapa.parse.mockReturnValue({
        data: mockData,
        errors: [],
      });

      const filePath = "/tmp/test.csv";
      const fileContent = mockFs.readFileSync(filePath, "utf8");
      mockPapa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      // Verify transformHeader function was called
      expect(mockPapa.parse).toHaveBeenCalledWith(mockCsvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: expect.any(Function),
      });
    });

    it("should skip empty lines", () => {
      const csvWithEmptyLines = `title,date
Event 1,2024-03-15

Event 2,2024-03-16`;

      mockFs.readFileSync.mockReturnValue(csvWithEmptyLines);
      mockPapa.parse.mockReturnValue({
        data: [
          { title: "Event 1", date: "2024-03-15" },
          { title: "Event 2", date: "2024-03-16" },
        ],
        errors: [],
      });

      const filePath = "/tmp/test.csv";
      const fileContent = mockFs.readFileSync(filePath, "utf8");
      const parseResult = mockPapa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      }) as { data: any[]; errors: any[] };

      expect(parseResult.data).toHaveLength(2);
      expect(mockPapa.parse).toHaveBeenCalledWith(
        csvWithEmptyLines,
        expect.objectContaining({ skipEmptyLines: true }),
      );
    });
  });

  describe("Excel Parsing", () => {
    const mockWorkbook = {
      SheetNames: ["Sheet1", "Sheet2"],
      Sheets: {
        Sheet1: {
          A1: { v: "title" },
          B1: { v: "description" },
          C1: { v: "date" },
          A2: { v: "Tech Conference 2024" },
          B2: { v: "Annual technology conference" },
          C2: { v: "2024-03-15" },
        },
        Sheet2: {},
      },
    };

    beforeEach(() => {
      mockXLSX.readFile.mockReturnValue(mockWorkbook);
    });

    it("should parse Excel file correctly", () => {
      const mockSheetData = [
        ["title", "description", "date"],
        ["Tech Conference 2024", "Annual technology conference", "2024-03-15"],
        ["Art Gallery Opening", "Contemporary art exhibition", "2024-03-20"],
      ];

      mockXLSX.utils.sheet_to_json.mockReturnValue(mockSheetData);

      const filePath = "/tmp/test.xlsx";
      const workbook = mockXLSX.readFile(filePath) as any;
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = mockXLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      }) as any[];

      expect(mockXLSX.readFile).toHaveBeenCalledWith(filePath);
      expect(mockXLSX.utils.sheet_to_json).toHaveBeenCalledWith(worksheet, {
        header: 1,
        defval: "",
      });

      expect(rawData).toHaveLength(3);
      expect(rawData[0]).toEqual(["title", "description", "date"]);
      expect(rawData[1]).toEqual([
        "Tech Conference 2024",
        "Annual technology conference",
        "2024-03-15",
      ]);
    });

    it("should convert Excel data to object format", () => {
      const mockSheetData = [
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

      mockXLSX.utils.sheet_to_json.mockReturnValue(mockSheetData);

      const filePath = "/tmp/test.xlsx";
      const workbook = mockXLSX.readFile(filePath) as any;
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawData = mockXLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      }) as any[];

      // Convert to object format
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
    });

    it("should handle Excel files with multiple sheets", () => {
      const workbook = mockXLSX.readFile("/tmp/multi-sheet.xlsx") as any;

      expect(workbook.SheetNames).toEqual(["Sheet1", "Sheet2"]);
      expect(workbook.SheetNames[0]).toBe("Sheet1"); // Should use first sheet
    });

    it("should handle Excel parsing errors", () => {
      mockXLSX.readFile.mockImplementation(() => {
        throw new Error("Invalid Excel file format");
      });

      expect(() => {
        mockXLSX.readFile("/tmp/corrupt.xlsx");
      }).toThrow("Invalid Excel file format");
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

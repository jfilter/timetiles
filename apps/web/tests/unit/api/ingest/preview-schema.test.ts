// @vitest-environment node
/**
 * Unit tests for the preview-schema API routes (upload and URL).
 *
 * Tests the POST handlers with mocked external dependencies
 * (Payload, filesystem, parsers).
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

import type * as Papa from "papaparse";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => {
  const mockGetPayloadFn = vi.fn();
  return {
    mockGetPayload: mockGetPayloadFn,
    mockPapaParse: vi.fn(),
    mockXlsxRead: vi.fn(),
    mockSheetToCsv: vi.fn(),
    mockFetchWithRetry: vi.fn(),
    mockDetectFileTypeFromResponse: vi.fn(),
    mockBuildAuthHeaders: vi.fn(),
    mockFetchRemoteData: vi.fn(),
    mockDetectLanguage: vi.fn(),
    mockExistsSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockUnlinkSync: vi.fn(),
  };
});

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

// Mock app-config to prevent loadFromYaml from using the mocked fs
vi.mock("@/lib/config/app-config", () => ({
  getAppConfig: () => ({
    batchSizes: { duplicateAnalysis: 5000, schemaDetection: 10000, eventCreation: 1000, databaseChunk: 1000 },
  }),
  resetAppConfig: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.mockExistsSync,
    mkdirSync: mocks.mockMkdirSync,
    writeFileSync: mocks.mockWriteFileSync,
    readFileSync: mocks.mockReadFileSync,
    unlinkSync: mocks.mockUnlinkSync,
  },
}));

vi.mock("papaparse", () => ({ default: { parse: mocks.mockPapaParse } }));

vi.mock("xlsx", () => ({ read: mocks.mockXlsxRead, utils: { sheet_to_csv: mocks.mockSheetToCsv } }));

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("test-uuid") }));

vi.mock("@/lib/ingest/url-fetch/auth", () => ({ buildAuthHeaders: mocks.mockBuildAuthHeaders }));

vi.mock("@/lib/ingest/url-fetch/fetch-utils", () => ({
  fetchWithRetry: mocks.mockFetchWithRetry,
  detectFileTypeFromResponse: mocks.mockDetectFileTypeFromResponse,
}));

vi.mock("@/lib/ingest/fetch-remote-data", () => ({ fetchRemoteData: mocks.mockFetchRemoteData }));

// Only language detection is stubbed (it is non-deterministic on short samples);
// the real pattern table and matcher run, so this exercises production matching
// instead of a hand-written copy that could drift from it.
vi.mock("@/lib/services/schema-detection", async (importOriginal) => {
  const actual = await importOriginal<typeof SchemaDetection>();
  return { ...actual, detectLanguage: mocks.mockDetectLanguage };
});

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn().mockResolvedValue(null) }));

// 4. Vitest imports and source code AFTER mocks
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as UploadPOST } from "@/app/api/ingest/preview-schema/upload/route";
import { POST as UrlPOST } from "@/app/api/ingest/preview-schema/url/route";
import { resetEnv } from "@/lib/config/env";
import type * as SchemaDetection from "@/lib/services/schema-detection";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../../constants/test-credentials";

// --- Helpers ---

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createUploadRequest = (formData: FormData) => {
  return new Request("http://localhost/api/ingest/preview-schema/upload", {
    method: "POST",
    body: formData,
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  }) as unknown as NextRequest;
};

const createUrlRequest = (body: Record<string, unknown>) => {
  return new Request("http://localhost/api/ingest/preview-schema/url", {
    method: "POST",
    body: JSON.stringify(body),
    headers: new Headers({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}`,
    }),
  }) as unknown as NextRequest;
};

const createFileFormData = (filename: string, content: string, mimeType: string): FormData => {
  const formData = new FormData();
  const file = new File([content], filename, { type: mimeType });
  formData.append("file", file);
  return formData;
};

// --- Tests ---

describe.sequential("POST /api/ingest/preview-schema/upload", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: mockUser }),
      find: vi.fn().mockResolvedValue({ docs: [] }),
    });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockDetectLanguage.mockReturnValue({ code: "eng", confidence: 0.9 });
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: null }) });

      const formData = new FormData();
      formData.append("file", new File(["test"], "test.csv", { type: "text/csv" }));
      const request = createUploadRequest(formData);

      const response = await UploadPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Authentication required");
    });
  });

  describe("Validation", () => {
    it("should return 400 when no file provided", async () => {
      const formData = new FormData();
      const request = createUploadRequest(formData);

      const response = await UploadPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("A file is required");
    });

    it("should return 400 for unsupported file type", async () => {
      const formData = createFileFormData("test.txt", "content", "text/html");
      const request = createUploadRequest(formData);

      const response = await UploadPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unsupported file");
    });

    it("should return 400 when file parsing fails", async () => {
      mocks.mockReadFileSync.mockReturnValue(Buffer.from("bad content"));
      mocks.mockPapaParse.mockImplementation(() => {
        throw new Error("Parse error");
      });

      const formData = createFileFormData("test.csv", "bad content", "text/csv");
      const request = createUploadRequest(formData);

      const response = await UploadPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Failed to parse file");
    });
  });

  describe("CSV File Upload", () => {
    it("should return sheets with headers, sample data, and suggested mappings for a CSV file", async () => {
      const csvHeaders = ["title", "description", "date", "lat", "lng", "location"];
      const csvRow = {
        title: "Event 1",
        description: "A test event",
        date: "2024-01-01",
        lat: "37.7749",
        lng: "-122.4194",
        location: "San Francisco",
      };

      mocks.mockPapaParse.mockReturnValueOnce({
        data: [csvRow, csvRow, csvRow],
        meta: { fields: csvHeaders },
        errors: [],
      });

      mocks.mockReadFileSync.mockReturnValue(
        Buffer.from(
          "title,description,date,lat,lng,location\nEvent 1,A test event,2024-01-01,37.7749,-122.4194,San Francisco"
        )
      );

      const formData = createFileFormData("events.csv", "csv-content", "text/csv");
      const request = createUploadRequest(formData);

      const response = await UploadPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.previewId).toBe("test-uuid");
      expect(body.sheets).toHaveLength(1);

      const sheet = body.sheets[0];
      expect(sheet.name).toBe("Sheet1");
      expect(sheet.headers).toEqual(csvHeaders);
      expect(sheet.sampleData).toEqual([csvRow, csvRow, csvRow]);
      expect(mocks.mockPapaParse).toHaveBeenCalledTimes(1);
      expect(sheet.rowCount).toBe(3);

      // Verify suggested mappings were generated
      expect(sheet.suggestedMappings).toBeDefined();
      expect(sheet.suggestedMappings.language).toEqual({ code: "eng", confidence: 0.9 });
      expect(sheet.suggestedMappings.mappings.titlePath.path).toBe("title");
      expect(sheet.suggestedMappings.mappings.titlePath.confidenceLevel).toBe("high");
      expect(sheet.suggestedMappings.mappings.latitudePath.path).toBe("lat");
      expect(sheet.suggestedMappings.mappings.longitudePath.path).toBe("lng");
      expect(sheet.suggestedMappings.mappings.locationPath.path).toBe("location");

      // Verify file was written to temp directory
      expect(mocks.mockWriteFileSync).toHaveBeenCalled();
    });

    it("should not persist authConfig to metadata file on disk (Bug 20)", async () => {
      const csvHeaders = ["title", "date"];
      const csvRow = { title: "Event 1", date: "2024-01-01" };

      mocks.mockPapaParse.mockReturnValueOnce({ data: [csvRow], meta: { fields: csvHeaders }, errors: [] });
      mocks.mockReadFileSync.mockReturnValue(Buffer.from("title,date\nEvent 1,2024-01-01"));

      const formData = createFileFormData("events.csv", "csv-content", "text/csv");
      const request = createUploadRequest(formData);

      await UploadPOST(request, {} as never);

      // Find the metadata write call (the one writing .meta.json content)
      const writeFileSyncCalls = mocks.mockWriteFileSync.mock.calls;
      const metaWriteCall = writeFileSyncCalls.find(
        (call: unknown[]) => typeof call[0] === "string" && call[0].endsWith(".meta.json")
      );

      expect(metaWriteCall).toBeDefined();
      const metaContent = JSON.parse(metaWriteCall![1] as string);
      expect(metaContent).not.toHaveProperty("authConfig");
    });
  });

  describe("Excel blank-column header mapping", () => {
    beforeEach(async () => {
      const { default: papa } = await vi.importActual<{ default: typeof Papa }>("papaparse");
      mocks.mockPapaParse.mockImplementation(papa.parse);
    });

    it("should map data to correct columns when blank headers exist", async () => {
      mocks.mockXlsxRead.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
      mocks.mockSheetToCsv.mockReturnValue("Name,,Age\nAlice,BLANK_DATA,30");
      const formData = createFileFormData(
        "test.xlsx",
        "excel-content",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const request = createUploadRequest(formData);
      const response = await UploadPOST(request, {} as never);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.sheets).toHaveLength(1);
      const sheet = body.sheets[0];
      expect(sheet.headers).toEqual(["Name", "", "Age"]);
      expect(sheet.sampleData).toHaveLength(1);
      expect(sheet.sampleData[0]).toEqual({ Name: "Alice", "": "BLANK_DATA", Age: "30" });
    });
    it("should handle multiple blank columns in Excel headers", async () => {
      mocks.mockXlsxRead.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
      mocks.mockSheetToCsv.mockReturnValue("ID,,Name,,Value\n1,first,Alice,second,100");
      const formData = createFileFormData(
        "test.xlsx",
        "excel-content",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const request = createUploadRequest(formData);
      const response = await UploadPOST(request, {} as never);
      const body = await response.json();
      expect(response.status).toBe(200);
      const sheet = body.sheets[0];
      expect(sheet.headers).toEqual(["ID", "", "Name", "_1", "Value"]);
      expect(sheet.sampleData[0]).toEqual({ ID: "1", "": "first", Name: "Alice", _1: "second", Value: "100" });
    });
  });
});

describe.sequential("POST /api/ingest/preview-schema/url", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    mocks.mockGetPayload.mockResolvedValue({
      auth: vi.fn().mockResolvedValue({ user: mockUser }),
      find: vi.fn().mockResolvedValue({ docs: [] }),
    });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockBuildAuthHeaders.mockReturnValue({});
    mocks.mockDetectLanguage.mockReturnValue({ code: "eng", confidence: 0.9 });
    // The real SSRF check runs; its opt-out must not leak in from the environment.
    delete process.env.ALLOW_PRIVATE_URLS;
    resetEnv();
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: null }) });

      const request = createUrlRequest({ sourceUrl: "https://example.com/data.csv" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Authentication required");
    });
  });

  describe("Validation", () => {
    it("should return 422 for invalid URL format", async () => {
      const request = createUrlRequest({ sourceUrl: "not-a-valid-url" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it.each(["ftp://example.com/data.csv", "file:///etc/passwd"])(
      "should return 400 for non-HTTP URL protocol %s",
      async (sourceUrl) => {
        const response = await UrlPOST(createUrlRequest({ sourceUrl }), {} as never);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain("Invalid URL");
        expect(mocks.mockFetchRemoteData).not.toHaveBeenCalled();
      }
    );

    it.each([
      "http://localhost/data.csv",
      "http://127.0.0.1/data.csv",
      "http://10.0.0.1/data.csv",
      "http://192.168.1.1/data.csv",
      "http://172.16.0.1/data.csv",
    ])("should return 400 for private/internal URL %s (SSRF)", async (sourceUrl) => {
      const response = await UrlPOST(createUrlRequest({ sourceUrl }), {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("private or internal networks");
      expect(mocks.mockFetchRemoteData).not.toHaveBeenCalled();
    });

    it("should return 400 for unsupported file type from URL", async () => {
      mocks.mockFetchRemoteData.mockRejectedValue(
        new Error("Unsupported file type: application/json (.json). The URL must return CSV, Excel, ODS, or JSON data.")
      );

      const request = createUrlRequest({ sourceUrl: "https://example.com/data.bin" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unsupported file type");
    });

    it("should return 400 when URL fetch fails", async () => {
      mocks.mockFetchRemoteData.mockRejectedValue(new Error("Connection refused"));

      const request = createUrlRequest({ sourceUrl: "https://example.com/data.csv" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Failed to fetch URL");
      expect(body.error).toContain("Connection refused");
    });
  });

  describe("URL Source", () => {
    it("should successfully preview CSV data from a URL", async () => {
      const csvContent = "title,date\nEvent 1,2024-01-01";
      const fetchedData = Buffer.from(csvContent);

      mocks.mockFetchRemoteData.mockResolvedValue({
        data: fetchedData,
        mimeType: "text/csv",
        fileExtension: ".csv",
        contentHash: "abc123",
        originalContentType: "text/csv",
        wasConverted: false,
      });

      mocks.mockReadFileSync.mockReturnValue(Buffer.from(csvContent));
      mocks.mockPapaParse.mockReturnValueOnce({
        data: [{ title: "Event 1", date: "2024-01-01" }],
        meta: { fields: ["title", "date"] },
        errors: [],
      });

      const request = createUrlRequest({ sourceUrl: "https://example.com/events.csv" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.previewId).toBe("test-uuid");
      expect(body.sourceUrl).toBe("https://example.com/events.csv");
      expect(body.sheets).toHaveLength(1);
      expect(body.sheets[0].headers).toEqual(["title", "date"]);
      expect(body.sheets[0].suggestedMappings.mappings.titlePath.path).toBe("title");
    });

    it("should not persist auth config to metadata for URL sources (Bug 20)", async () => {
      const csvContent = "title,date\nEvent 1,2024-01-01";
      const fetchedData = Buffer.from(csvContent);

      mocks.mockFetchRemoteData.mockResolvedValue({
        data: fetchedData,
        mimeType: "text/csv",
        fileExtension: ".csv",
        contentHash: "abc123",
        originalContentType: "text/csv",
        wasConverted: false,
      });

      mocks.mockReadFileSync.mockReturnValue(Buffer.from(csvContent));
      mocks.mockPapaParse.mockReturnValueOnce({
        data: [{ title: "Event 1", date: "2024-01-01" }],
        meta: { fields: ["title", "date"] },
        errors: [],
      });

      const request = createUrlRequest({
        sourceUrl: "https://example.com/events.csv",
        authConfig: { type: "bearer", bearerToken: "secret-token-value" },
      });

      await UrlPOST(request, {} as never);

      // Find the metadata write call
      const writeFileSyncCalls = mocks.mockWriteFileSync.mock.calls;
      const metaWriteCall = writeFileSyncCalls.find(
        (call: unknown[]) => typeof call[0] === "string" && call[0].endsWith(".meta.json")
      );

      expect(metaWriteCall).toBeDefined();
      const metaContent = JSON.parse(metaWriteCall![1] as string);
      // Auth config must NOT be persisted to disk
      expect(metaContent).not.toHaveProperty("authConfig");
      // Source URL should still be stored
      expect(metaContent.sourceUrl).toBe("https://example.com/events.csv");
    });
  });
});

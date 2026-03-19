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

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => {
  const mockGetPayloadFn = vi.fn();
  return {
    mockGetPayload: mockGetPayloadFn,
    mockPapaParse: vi.fn(),
    mockXlsxRead: vi.fn(),
    mockSheetToJson: vi.fn(),
    mockFetchWithRetry: vi.fn(),
    mockDetectFileTypeFromResponse: vi.fn(),
    mockBuildAuthHeaders: vi.fn(),
    mockDetectLanguageFromSamples: vi.fn(),
    mockExistsSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockUnlinkSync: vi.fn(),
    mockIsPrivateUrl: vi.fn(),
  };
});

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

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

vi.mock("xlsx", () => ({ read: mocks.mockXlsxRead, utils: { sheet_to_json: mocks.mockSheetToJson } }));

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("test-uuid") }));

vi.mock("@/lib/jobs/handlers/url-fetch-job/auth", () => ({ buildAuthHeaders: mocks.mockBuildAuthHeaders }));

vi.mock("@/lib/jobs/handlers/url-fetch-job/fetch-utils", () => ({
  fetchWithRetry: mocks.mockFetchWithRetry,
  detectFileTypeFromResponse: mocks.mockDetectFileTypeFromResponse,
}));

vi.mock("@/lib/services/schema-builder/language-detection", () => ({
  detectLanguageFromSamples: mocks.mockDetectLanguageFromSamples,
}));

vi.mock("@timetiles/payload-schema-detection", async () => {
  const actual = await vi.importActual("@timetiles/payload-schema-detection");
  return {
    ...(actual as Record<string, unknown>),
    FIELD_PATTERNS: {
      title: { eng: [/^title$/i] },
      description: { eng: [/^description$/i] },
      timestamp: { eng: [/^date$/i] },
      location: { eng: [/^location$/i] },
    },
    LATITUDE_PATTERNS: [/^lat$/i, /^latitude$/i],
    LONGITUDE_PATTERNS: [/^lng$/i, /^longitude$/i],
  };
});

vi.mock("@/lib/security/url-validation", () => ({
  isPrivateUrl: mocks.mockIsPrivateUrl,
  validateExternalHttpUrl: (urlString: string) => {
    try {
      const url = new URL(urlString);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
      }
      if (mocks.mockIsPrivateUrl(urlString)) {
        return { error: "URLs pointing to private or internal networks are not allowed." };
      }
      return { url };
    } catch {
      return { error: "Invalid URL. Please provide a valid HTTP or HTTPS URL." };
    }
  },
}));

vi.mock("@/lib/middleware/auth", () => ({}));

// 4. Vitest imports and source code AFTER mocks
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as UploadPOST } from "@/app/api/import/preview-schema/upload/route";
import { POST as UrlPOST } from "@/app/api/import/preview-schema/url/route";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../../constants/test-credentials";

// --- Helpers ---

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createUploadRequest = (formData: FormData) => {
  return new Request("http://localhost/api/import/preview-schema/upload", {
    method: "POST",
    body: formData,
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  }) as unknown as NextRequest;
};

const createUrlRequest = (body: Record<string, unknown>) => {
  return new Request("http://localhost/api/import/preview-schema/url", {
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

describe.sequential("POST /api/import/preview-schema/upload", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: mockUser }) });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockDetectLanguageFromSamples.mockReturnValue({ code: "eng", confidence: 0.9 });
    mocks.mockIsPrivateUrl.mockReturnValue(false);
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
      mocks.mockReadFileSync.mockReturnValue("bad content");
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

      mocks.mockPapaParse
        .mockReturnValueOnce({ data: [csvRow], meta: { fields: csvHeaders }, errors: [] })
        .mockReturnValueOnce({ data: [csvRow, csvRow, csvRow], meta: { fields: csvHeaders }, errors: [] });

      mocks.mockReadFileSync.mockReturnValue(
        "title,description,date,lat,lng,location\nEvent 1,A test event,2024-01-01,37.7749,-122.4194,San Francisco"
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
      expect(sheet.sampleData).toEqual([csvRow]);
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

      mocks.mockPapaParse
        .mockReturnValueOnce({ data: [csvRow], meta: { fields: csvHeaders }, errors: [] })
        .mockReturnValueOnce({ data: [csvRow], meta: { fields: csvHeaders }, errors: [] });
      mocks.mockReadFileSync.mockReturnValue("title,date\nEvent 1,2024-01-01");

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
    it("should map data to correct columns when blank headers exist", async () => {
      mocks.mockXlsxRead.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
      mocks.mockSheetToJson.mockReturnValue([
        ["Name", "", "Age"],
        ["Alice", "BLANK_DATA", 30],
      ]);
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
      expect(sheet.headers).toEqual(["Name", "Age"]);
      expect(sheet.sampleData).toHaveLength(1);
      expect(sheet.sampleData[0]).toEqual({ Name: "Alice", Age: 30 });
    });
    it("should handle multiple blank columns in Excel headers", async () => {
      mocks.mockXlsxRead.mockReturnValue({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } });
      mocks.mockSheetToJson.mockReturnValue([
        ["ID", "", "Name", null, "Value"],
        [1, "skip1", "Alice", "skip2", 100],
      ]);
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
      expect(sheet.headers).toEqual(["ID", "Name", "Value"]);
      expect(sheet.sampleData[0]).toEqual({ ID: 1, Name: "Alice", Value: 100 });
    });
  });
});

describe.sequential("POST /api/import/preview-schema/url", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: mockUser }) });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockBuildAuthHeaders.mockReturnValue({});
    mocks.mockDetectLanguageFromSamples.mockReturnValue({ code: "eng", confidence: 0.9 });
    mocks.mockIsPrivateUrl.mockReturnValue(false);
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

    it("should return 400 for non-HTTP URL protocol", async () => {
      const request = createUrlRequest({ sourceUrl: "ftp://example.com/data.csv" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      // ftp:// passes Zod's z.string().url() but fails our validateUrl SSRF check
      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid URL");
    });

    it("should return 400 for private/internal URLs (Bug 19 - SSRF)", async () => {
      mocks.mockIsPrivateUrl.mockReturnValue(true);

      const privateUrls = [
        "http://localhost/data.csv",
        "http://127.0.0.1/data.csv",
        "http://10.0.0.1/data.csv",
        "http://192.168.1.1/data.csv",
        "http://172.16.0.1/data.csv",
      ];

      for (const privateUrl of privateUrls) {
        const request = createUrlRequest({ sourceUrl: privateUrl });

        const response = await UrlPOST(request, {} as never);
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body.error).toContain("private or internal networks");
      }
    });

    it("should return 400 for unsupported file type from URL", async () => {
      mocks.mockFetchWithRetry.mockResolvedValue({
        data: Buffer.from("some data"),
        contentType: "application/json",
        fileExtension: ".json",
        attempts: 1,
      });

      const request = createUrlRequest({ sourceUrl: "https://example.com/data.json" });

      const response = await UrlPOST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unsupported file type detected");
    });

    it("should return 400 when URL fetch fails", async () => {
      mocks.mockFetchWithRetry.mockRejectedValue(new Error("Connection refused"));

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

      mocks.mockFetchWithRetry.mockResolvedValue({
        data: fetchedData,
        contentType: "text/csv",
        fileExtension: ".csv",
        attempts: 1,
      });

      mocks.mockReadFileSync.mockReturnValue(csvContent);
      mocks.mockPapaParse
        .mockReturnValueOnce({
          data: [{ title: "Event 1", date: "2024-01-01" }],
          meta: { fields: ["title", "date"] },
          errors: [],
        })
        .mockReturnValueOnce({
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

      mocks.mockFetchWithRetry.mockResolvedValue({
        data: fetchedData,
        contentType: "text/csv",
        fileExtension: ".csv",
        attempts: 1,
      });

      mocks.mockReadFileSync.mockReturnValue(csvContent);
      mocks.mockPapaParse
        .mockReturnValueOnce({
          data: [{ title: "Event 1", date: "2024-01-01" }],
          meta: { fields: ["title", "date"] },
          errors: [],
        })
        .mockReturnValueOnce({
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

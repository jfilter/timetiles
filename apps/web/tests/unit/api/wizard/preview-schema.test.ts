// @vitest-environment node
/**
 * Unit tests for the preview-schema API route.
 *
 * Tests the POST handler through the withAuth middleware with mocked
 * external dependencies (Payload, filesystem, parsers).
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => {
  const mockAuthFn = vi.fn();
  const mockGetPayloadFn = vi.fn();
  return {
    mockAuth: mockAuthFn,
    mockGetPayload: mockGetPayloadFn,
    mockPapaParse: vi.fn(),
    mockXlsxRead: vi.fn(),
    mockSheetToJson: vi.fn(),
    mockFetchUrlData: vi.fn(),
    mockDetectFileTypeFromResponse: vi.fn(),
    mockBuildAuthHeaders: vi.fn(),
    mockDetectLanguageFromSamples: vi.fn(),
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

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.mockExistsSync,
    mkdirSync: mocks.mockMkdirSync,
    writeFileSync: mocks.mockWriteFileSync,
    readFileSync: mocks.mockReadFileSync,
    unlinkSync: mocks.mockUnlinkSync,
  },
}));

vi.mock("papaparse", () => ({
  default: { parse: mocks.mockPapaParse },
}));

vi.mock("xlsx", () => ({
  read: mocks.mockXlsxRead,
  utils: { sheet_to_json: mocks.mockSheetToJson },
}));

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("test-uuid") }));

vi.mock("@/lib/jobs/handlers/url-fetch-job/auth", () => ({
  buildAuthHeaders: mocks.mockBuildAuthHeaders,
}));

vi.mock("@/lib/jobs/handlers/url-fetch-job/fetch-utils", () => ({
  fetchUrlData: mocks.mockFetchUrlData,
  detectFileTypeFromResponse: mocks.mockDetectFileTypeFromResponse,
}));

vi.mock("@/lib/services/schema-builder/language-detection", () => ({
  detectLanguageFromSamples: mocks.mockDetectLanguageFromSamples,
}));

vi.mock("@timetiles/payload-schema-detection", () => ({
  FIELD_PATTERNS: {
    title: { eng: [/^title$/i] },
    description: { eng: [/^description$/i] },
    timestamp: { eng: [/^date$/i] },
    location: { eng: [/^location$/i] },
  },
  LATITUDE_PATTERNS: [/^lat$/i, /^latitude$/i],
  LONGITUDE_PATTERNS: [/^lng$/i, /^longitude$/i],
}));

// Mock withAuth to bypass Payload authentication entirely
vi.mock("@/lib/middleware/auth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => {
    return async (request: Request, context: unknown) => {
      // Simulate the withAuth middleware by calling our mockAuth
      const authResult = await mocks.mockAuth();
      if (!authResult?.user) {
        return Response.json({ error: "Authentication required" }, { status: 401 });
      }
      // Attach user to request (mimicking real withAuth)
      (request as unknown as Record<string, unknown>).user = authResult.user;
      return handler(request, context);
    };
  },
}));

// 4. Vitest imports and source code AFTER mocks
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/wizard/preview-schema/route";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../../constants/test-credentials";

// --- Helpers ---

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createMockRequest = (formData: FormData) => {
  // Cast to NextRequest for type compatibility; withAuth mock accepts plain Request
  return new Request("http://localhost/api/wizard/preview-schema", {
    method: "POST",
    body: formData,
    headers: new Headers({
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

describe.sequential("POST /api/wizard/preview-schema", () => {
  beforeEach(() => {
    // Reset call history on all mocks without clearing implementations
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    // Default: authenticated user
    mocks.mockAuth.mockResolvedValue({ user: mockUser });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockBuildAuthHeaders.mockReturnValue({});
    mocks.mockDetectLanguageFromSamples.mockReturnValue({ code: "eng", confidence: 0.9 });
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mocks.mockAuth.mockResolvedValue({ user: null });

      const formData = new FormData();
      formData.append("file", new File(["test"], "test.csv", { type: "text/csv" }));
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Authentication required");
    });
  });

  describe("Validation", () => {
    it("should return 400 when no file or sourceUrl provided", async () => {
      const formData = new FormData();
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("Either a file or sourceUrl is required");
    });

    it("should return 400 for unsupported file type", async () => {
      const formData = createFileFormData("test.txt", "content", "text/html");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unsupported file");
    });

    it("should return 400 when file parsing fails", async () => {
      // Mock readFileSync to return content and Papa.parse to throw
      mocks.mockReadFileSync.mockReturnValue("bad content");
      mocks.mockPapaParse.mockImplementation(() => {
        throw new Error("Parse error");
      });

      const formData = createFileFormData("test.csv", "bad content", "text/csv");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
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

      // Mock Papa.parse: first call for preview (with preview option), second for full count
      mocks.mockPapaParse
        .mockReturnValueOnce({
          data: [csvRow],
          meta: { fields: csvHeaders },
          errors: [],
        })
        .mockReturnValueOnce({
          data: [csvRow, csvRow, csvRow],
          meta: { fields: csvHeaders },
          errors: [],
        });

      mocks.mockReadFileSync.mockReturnValue(
        "title,description,date,lat,lng,location\nEvent 1,A test event,2024-01-01,37.7749,-122.4194,San Francisco"
      );

      const formData = createFileFormData("events.csv", "csv-content", "text/csv");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
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
  });

  describe("URL Source", () => {
    it("should return 400 for invalid URL", async () => {
      const formData = new FormData();
      formData.append("sourceUrl", "not-a-valid-url");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid URL");
    });

    it("should return 400 for non-HTTP URL protocol", async () => {
      const formData = new FormData();
      formData.append("sourceUrl", "ftp://example.com/data.csv");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Invalid URL");
    });

    it("should return 400 for unsupported file type from URL", async () => {
      mocks.mockFetchUrlData.mockResolvedValue({
        data: Buffer.from("some data"),
        contentType: "application/json",
      });
      mocks.mockDetectFileTypeFromResponse.mockReturnValue({
        fileExtension: ".json",
        mimeType: "application/json",
      });

      const formData = new FormData();
      formData.append("sourceUrl", "https://example.com/data.json");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Unsupported file type detected");
    });

    it("should return 400 when URL fetch fails", async () => {
      mocks.mockFetchUrlData.mockRejectedValue(new Error("Connection refused"));

      const formData = new FormData();
      formData.append("sourceUrl", "https://example.com/data.csv");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Failed to fetch URL");
      expect(body.error).toContain("Connection refused");
    });

    it("should successfully preview CSV data from a URL", async () => {
      const csvContent = "title,date\nEvent 1,2024-01-01";
      const fetchedData = Buffer.from(csvContent);

      mocks.mockFetchUrlData.mockResolvedValue({
        data: fetchedData,
        contentType: "text/csv",
      });
      mocks.mockDetectFileTypeFromResponse.mockReturnValue({
        fileExtension: ".csv",
        mimeType: "text/csv",
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

      const formData = new FormData();
      formData.append("sourceUrl", "https://example.com/events.csv");
      const request = createMockRequest(formData);

      const response = await POST(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.previewId).toBe("test-uuid");
      expect(body.sourceUrl).toBe("https://example.com/events.csv");
      expect(body.sheets).toHaveLength(1);
      expect(body.sheets[0].headers).toEqual(["title", "date"]);
      expect(body.sheets[0].suggestedMappings.mappings.titlePath.path).toBe("title");
    });
  });
});

// @vitest-environment node
/**
 * Unit tests for the GET /api/import/preview-schema route.
 *
 * Tests that the GET handler re-parses preview files from disk
 * with proper auth, ownership, and expiry validation.
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockPapaParse: vi.fn(),
  mockXlsxRead: vi.fn(),
  mockSheetToJson: vi.fn(),
  mockDetectLanguage: vi.fn(),
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockIsPrivateUrl: vi.fn(),
}));

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mocks.mockExistsSync,
    mkdirSync: mocks.mockMkdirSync,
    readFileSync: mocks.mockReadFileSync,
    writeFileSync: mocks.mockWriteFileSync,
    unlinkSync: mocks.mockUnlinkSync,
  },
}));

vi.mock("papaparse", () => ({ default: { parse: mocks.mockPapaParse } }));
vi.mock("xlsx", () => ({ read: mocks.mockXlsxRead, utils: { sheet_to_json: mocks.mockSheetToJson } }));

vi.mock("@/lib/services/schema-detection", () => {
  const TEST_FIELD_PATTERNS: Record<string, Record<string, RegExp[]>> = {
    title: { eng: [/^title$/i] },
    description: { eng: [/^description$/i] },
    timestamp: { eng: [/^date$/i] },
    location: { eng: [/^location$/i] },
    locationName: { eng: [/^venue$/i] },
  };

  const getFieldPatterns = (fieldType: string, language: string): readonly RegExp[] => {
    const typePatterns = TEST_FIELD_PATTERNS[fieldType];
    return typePatterns?.[language] ?? typePatterns?.eng ?? [];
  };

  const matchFieldNamePatterns = (names: string[], fieldType: string, language: string) => {
    const patterns = getFieldPatterns(fieldType, language);
    for (let i = 0; i < patterns.length; i++) {
      const match = names.find((n) => patterns[i]!.test(n));
      if (match) return { name: match, patternIndex: i, patternCount: patterns.length, isFallback: false };
    }
    return null;
  };

  return {
    detectLanguage: mocks.mockDetectLanguage,
    FIELD_PATTERNS: TEST_FIELD_PATTERNS,
    LATITUDE_PATTERNS: [/^lat$/i, /^latitude$/i],
    LONGITUDE_PATTERNS: [/^lng$/i, /^longitude$/i],
    getFieldPatterns,
    matchFieldNamePatterns,
  };
});

vi.mock("@/lib/security/url-validation", () => ({ isPrivateUrl: mocks.mockIsPrivateUrl }));

// 4. Vitest imports and source code AFTER mocks
import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/import/preview-schema/route";

import { TEST_CREDENTIALS, TEST_EMAILS } from "../../../constants/test-credentials";

// --- Helpers ---

const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5";
const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const createGetRequest = (previewId: string) => {
  return new Request(`http://localhost/api/import/preview-schema?previewId=${previewId}`, {
    method: "GET",
    headers: new Headers({ Authorization: `Bearer ${TEST_CREDENTIALS.bearer.token}` }),
  }) as unknown as NextRequest;
};

const mockMetadata = (overrides?: Record<string, unknown>) =>
  JSON.stringify({
    previewId: VALID_UUID,
    userId: 1,
    originalName: "events.csv",
    filePath: `/tmp/timetiles-wizard-preview/${VALID_UUID}.csv`,
    mimeType: "text/csv",
    fileSize: 1024,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  });

// --- Tests ---

describe.sequential("GET /api/import/preview-schema", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }

    mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: mockUser }) });
    mocks.mockExistsSync.mockReturnValue(true);
    mocks.mockDetectLanguage.mockReturnValue({ code: "eng", confidence: 0.9, name: "English", isReliable: true });
  });

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mocks.mockGetPayload.mockResolvedValue({ auth: vi.fn().mockResolvedValue({ user: null }) });

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Authentication required");
    });
  });

  describe("Validation", () => {
    it("should return 422 when previewId is not a valid UUID", async () => {
      const request = createGetRequest("not-a-uuid");
      const response = await GET(request, {} as never);

      expect(response.status).toBe(422);
    });

    it("should return 400 when metadata file does not exist", async () => {
      mocks.mockExistsSync.mockReturnValue(false);

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Preview not found");
    });

    it("should return 400 when preview has expired", async () => {
      mocks.mockExistsSync.mockReturnValue(true);
      mocks.mockReadFileSync.mockReturnValue(mockMetadata({ expiresAt: new Date(Date.now() - 1000).toISOString() }));

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("expired");
    });

    it("should return 401 when userId does not match", async () => {
      mocks.mockExistsSync.mockReturnValue(true);
      mocks.mockReadFileSync.mockReturnValue(mockMetadata({ userId: 999 }));

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toContain("do not have access");
    });
  });

  describe("Success", () => {
    it("should return sheets with headers and sample data for a CSV file", async () => {
      const csvHeaders = ["title", "description", "date", "lat", "lng", "location"];
      const csvRow = {
        title: "Event 1",
        description: "A test event",
        date: "2024-01-01",
        lat: "37.7749",
        lng: "-122.4194",
        location: "San Francisco",
      };

      mocks.mockExistsSync.mockReturnValue(true);
      mocks.mockReadFileSync.mockImplementation((filePath: string) => {
        if (String(filePath).endsWith(".meta.json")) {
          return mockMetadata();
        }
        return "title,description,date,lat,lng,location\nEvent 1,A test event,2024-01-01,37.7749,-122.4194,San Francisco";
      });

      mocks.mockPapaParse
        .mockReturnValueOnce({ data: [csvRow], meta: { fields: csvHeaders }, errors: [] })
        .mockReturnValueOnce({ data: [csvRow, csvRow, csvRow], meta: { fields: csvHeaders }, errors: [] });

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sheets).toHaveLength(1);

      const sheet = body.sheets[0];
      expect(sheet.headers).toEqual(csvHeaders);
      expect(sheet.sampleData).toEqual([csvRow]);
      expect(sheet.rowCount).toBe(3);
      expect(sheet.suggestedMappings).toBeDefined();
      expect(sheet.suggestedMappings.mappings.titlePath.path).toBe("title");
    });

    it("should return multiple sheets for an Excel file", async () => {
      mocks.mockExistsSync.mockReturnValue(true);
      mocks.mockReadFileSync.mockImplementation((filePath: string): string => {
        if (String(filePath).endsWith(".meta.json")) {
          return mockMetadata({
            filePath: `/tmp/timetiles-wizard-preview/${VALID_UUID}.xlsx`,
            originalName: "events.xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
        }
        // xlsx.read() accepts string input — returns binary content as string for test
        return "excel-content";
      });

      mocks.mockXlsxRead.mockReturnValue({ SheetNames: ["Events", "Venues"], Sheets: { Events: {}, Venues: {} } });

      mocks.mockSheetToJson
        .mockReturnValueOnce([
          ["title", "date"],
          ["Event 1", "2024-01-01"],
        ])
        .mockReturnValueOnce([
          ["venue", "location"],
          ["Hall A", "123 Main St"],
        ]);

      const request = createGetRequest(VALID_UUID);
      const response = await GET(request, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.sheets).toHaveLength(2);
      expect(body.sheets[0].name).toBe("Events");
      expect(body.sheets[0].headers).toEqual(["title", "date"]);
      expect(body.sheets[1].name).toBe("Venues");
      expect(body.sheets[1].headers).toEqual(["venue", "location"]);
    });
  });
});

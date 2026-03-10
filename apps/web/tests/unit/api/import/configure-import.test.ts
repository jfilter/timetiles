// @vitest-environment node
/**
 * Unit tests for the configure-import API route.
 *
 * Tests the POST handler through the withAuth middleware with mocked
 * external dependencies (Payload, filesystem).
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  mockPayload: { create: vi.fn(), update: vi.fn(), find: vi.fn() },
  mockGetPayload: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
  mockValidateQuota: vi.fn(),
  mockCheckQuota: vi.fn(),
}));

// 3. vi.mock calls
vi.mock("payload", () => ({ getPayload: mocks.mockGetPayload }));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("node:fs", () => ({
  default: { existsSync: mocks.mockExistsSync, readFileSync: mocks.mockReadFileSync, unlinkSync: mocks.mockUnlinkSync },
}));

vi.mock("@/lib/middleware/auth", () => ({
  withAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
  withOptionalAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
  withAdminAuth: vi.fn((handler: (...args: unknown[]) => unknown) => handler),
}));

vi.mock("@/lib/services/quota-service", () => {
  class QuotaExceededError extends Error {
    statusCode = 429;
    quotaType: string;
    current: number;
    limit: number;
    constructor(quotaType: string, current: number, limit: number) {
      super(`Quota exceeded: ${quotaType}`);
      this.name = "QuotaExceededError";
      this.quotaType = quotaType;
      this.current = current;
      this.limit = limit;
    }
  }
  return {
    getQuotaService: () => ({ validateQuota: mocks.mockValidateQuota, checkQuota: mocks.mockCheckQuota }),
    QuotaExceededError,
  };
});

vi.mock("@/lib/constants/quota-constants", () => ({ QUOTA_TYPES: { ACTIVE_SCHEDULES: "maxActiveSchedules" } }));

// 4. Vitest imports and source code AFTER mocks
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/import/configure/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";

// --- Constants ---

const VALID_UUID = "12345678-1234-4123-8123-123456789abc";

const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };
const mockAdminUser = { id: 2, email: TEST_EMAILS.admin, role: "admin" };

const basePreviewMeta = {
  previewId: VALID_UUID,
  userId: 1,
  originalName: "events.csv",
  // eslint-disable-next-line sonarjs/publicly-writable-directories
  filePath: "/tmp/timetiles-wizard-preview/test-file.csv",
  mimeType: "text/csv",
  fileSize: 1024,
  createdAt: "2024-01-01T00:00:00Z",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
};

const baseSheetMapping = { sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Test Dataset" };

const baseFieldMapping = {
  sheetIndex: 0,
  titleField: "title",
  descriptionField: "description",
  dateField: "date",
  idField: null,
  idStrategy: "auto" as const,
  locationField: "location",
  latitudeField: "lat",
  longitudeField: "lng",
};

const baseBody = {
  previewId: VALID_UUID,
  catalogId: 1,
  sheetMappings: [baseSheetMapping],
  fieldMappings: [baseFieldMapping],
  deduplicationStrategy: "skip" as const,
  geocodingEnabled: true,
};

// --- Helpers ---

const createRequest = (body: Record<string, unknown>, user: Record<string, unknown> = mockUser) => {
  return { user, json: vi.fn().mockResolvedValue(body) } as unknown as AuthenticatedRequest;
};

/** Set up filesystem mocks so loadPreviewMetadata returns the given metadata. */
const setupPreviewMetadata = (meta: Record<string, unknown> | null) => {
  if (meta === null) {
    // Metadata file does not exist
    mocks.mockExistsSync.mockReturnValue(false);
    return;
  }
  // First call: existsSync for meta file (in loadPreviewMetadata)
  // Second call: existsSync for actual file (in validateRequest)
  // Third call: existsSync for cleanup
  mocks.mockExistsSync.mockReturnValue(true);
  // eslint-disable-next-line sonarjs/function-return-type
  mocks.mockReadFileSync.mockImplementation((filePath: string) => {
    if (typeof filePath === "string" && filePath.endsWith(".meta.json")) {
      return JSON.stringify(meta);
    }
    // Return a buffer for the actual file read
    return Buffer.from("file-content");
  });
};

// --- Tests ---

describe.sequential("POST /api/import/configure", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: Payload returns mock instance
    mocks.mockGetPayload.mockResolvedValue(mocks.mockPayload);

    // Default: create returns objects with incrementing IDs
    let createId = 100;
    // oxlint-disable-next-line promise/prefer-await-to-then
    mocks.mockPayload.create.mockResolvedValue({ id: createId++ });
    mocks.mockPayload.update.mockResolvedValue({ id: 1 });

    // Default: catalog ownership check passes (Bug 13)
    mocks.mockPayload.find.mockResolvedValue({ docs: [{ id: 1 }], totalDocs: 1 });

    // Default: quota check passes (Bug 15)
    mocks.mockValidateQuota.mockResolvedValue(undefined);

    // Default: preview metadata exists and is valid
    setupPreviewMetadata(basePreviewMeta);
  });

  describe("Validation Errors", () => {
    it("should return 422 when previewId is not a valid UUID", async () => {
      const req = createRequest({ ...baseBody, previewId: "" });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 when catalogId has invalid type", async () => {
      const req = createRequest({ ...baseBody, catalogId: "invalid" });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 when sheetMappings is empty", async () => {
      const req = createRequest({ ...baseBody, sheetMappings: [] });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 422 when fieldMappings is empty", async () => {
      const req = createRequest({ ...baseBody, fieldMappings: [] });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Preview Validation", () => {
    it("should return 422 for invalid UUID previewId", async () => {
      const req = createRequest({ ...baseBody, previewId: "not-a-uuid" });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("should return 400 for non-existent preview", async () => {
      setupPreviewMetadata(null);
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Preview not found or expired");
    });

    it("should return 401 when preview userId does not match authenticated user", async () => {
      setupPreviewMetadata({ ...basePreviewMeta, userId: 999 });
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("You do not have access to this preview");
    });

    it("should return 400 when preview file is missing from disk", async () => {
      // Meta file exists, but actual file does not
      mocks.mockExistsSync.mockImplementation(
        (filePath: string) => typeof filePath === "string" && filePath.endsWith(".meta.json")
      );
      mocks.mockReadFileSync.mockImplementation((filePath: string) => {
        if (typeof filePath === "string" && filePath.endsWith(".meta.json")) {
          return JSON.stringify(basePreviewMeta);
        }
        throw new Error("ENOENT: no such file or directory");
      });

      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Preview file not found");
    });

    it("should return 400 when preview has expired (Bug 27)", async () => {
      const expiredMeta = {
        ...basePreviewMeta,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
      };
      setupPreviewMetadata(expiredMeta);
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain("Preview has expired");
    });
  });

  describe("Catalog Handling", () => {
    it("should create a new catalog when catalogId is 'new' with a name", async () => {
      const req = createRequest({ ...baseBody, catalogId: "new", newCatalogName: "My Catalog" });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify catalog was created
      expect(mocks.mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "catalogs",
          data: expect.objectContaining({ name: "My Catalog", isPublic: true }),
        })
      );
    });

    it("should return 400 when catalogId is 'new' without newCatalogName", async () => {
      const req = createRequest({ ...baseBody, catalogId: "new" });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("New catalog name is required");
    });

    it("should return 403 when user does not own the catalog (Bug 13)", async () => {
      // Catalog ownership check fails
      mocks.mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });

      const req = createRequest({ ...baseBody, catalogId: 999 });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain("You do not have access to this catalog");
    });

    it("should allow admin to use any catalog (Bug 13)", async () => {
      // Catalog ownership check should be skipped for admins
      mocks.mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });

      const adminPreviewMeta = { ...basePreviewMeta, userId: mockAdminUser.id };
      setupPreviewMetadata(adminPreviewMeta);

      const req = createRequest({ ...baseBody, catalogId: 999 }, mockAdminUser);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Verify find was NOT called for admin (ownership check bypassed)
      const findCalls = mocks.mockPayload.find.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "catalogs"
      );
      expect(findCalls).toHaveLength(0);
    });
  });

  describe("Dataset Processing", () => {
    it("should create a new dataset when datasetId is 'new'", async () => {
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // First create call is for the new dataset, second is for the import file
      expect(mocks.mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          data: expect.objectContaining({
            name: "Test Dataset",
            catalog: 1,
            language: "eng",
            isPublic: true,
            fieldMappingOverrides: expect.objectContaining({
              titlePath: "title",
              descriptionPath: "description",
              timestampPath: "date",
            }),
          }),
        })
      );
    });

    it("should pass req to dataset create calls (Bug 14)", async () => {
      const req = createRequest(baseBody);

      await POST(req, {} as never);

      // Verify that req was passed to the dataset create call
      const datasetCreateCalls = mocks.mockPayload.create.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "datasets"
      );
      expect(datasetCreateCalls).toHaveLength(1);
      expect(datasetCreateCalls[0]![0]).toHaveProperty("req", req);
    });

    it("should pass req to dataset update calls (Bug 14)", async () => {
      const req = createRequest({ ...baseBody, sheetMappings: [{ sheetIndex: 0, datasetId: 42, newDatasetName: "" }] });

      await POST(req, {} as never);

      // Verify that req was passed to the dataset update call
      const datasetUpdateCalls = mocks.mockPayload.update.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "datasets"
      );
      expect(datasetUpdateCalls).toHaveLength(1);
      expect(datasetUpdateCalls[0]![0]).toHaveProperty("req", req);
    });

    it("should update an existing dataset when datasetId is numeric", async () => {
      const req = createRequest({ ...baseBody, sheetMappings: [{ sheetIndex: 0, datasetId: 42, newDatasetName: "" }] });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Should update existing dataset instead of creating
      expect(mocks.mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          id: 42,
          data: expect.objectContaining({ fieldMappingOverrides: expect.objectContaining({ titlePath: "title" }) }),
        })
      );
    });
  });

  describe("Successful Import", () => {
    it("should create import file and return success response", async () => {
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.importFileId).toBeDefined();
      expect(body.catalogId).toBe(1);
      expect(body.datasets).toBeDefined();

      // Verify import file creation
      expect(mocks.mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "import-files",
          data: expect.objectContaining({
            user: 1,
            catalog: 1,
            originalName: "events.csv",
            status: "pending",
            metadata: expect.objectContaining({
              source: "import-wizard",
              geocodingEnabled: true,
              deduplicationStrategy: "skip",
            }),
          }),
        })
      );

      // Verify cleanup was called (Bug 26: should clean up data files too)
      expect(mocks.mockUnlinkSync).toHaveBeenCalled();
    });
  });

  describe("Cleanup (Bug 26)", () => {
    it("should clean up both meta file and data files during cleanup", async () => {
      const req = createRequest(baseBody);

      await POST(req, {} as never);

      // cleanupPreview should attempt to delete meta + all data extensions
      // With existsSync returning true by default, it will try to unlink all matches
      const unlinkCalls = mocks.mockUnlinkSync.mock.calls;
      // At minimum, the meta file should be cleaned up
      const metaCleanup = unlinkCalls.some(
        (call: unknown[]) => typeof call[0] === "string" && call[0].endsWith(".meta.json")
      );
      expect(metaCleanup).toBe(true);

      // Data file extensions should also be checked
      const dataFileCleanups = unlinkCalls.filter(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          [".csv", ".xls", ".xlsx", ".ods"].some((ext) => (call[0] as string).endsWith(ext))
      );
      expect(dataFileCleanups.length).toBeGreaterThan(0);
    });
  });

  describe("Scheduled Import Creation", () => {
    it("should create a scheduled import when createSchedule is enabled", async () => {
      const req = createRequest({
        ...baseBody,
        createSchedule: {
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          name: "Daily Import",
          scheduleType: "frequency",
          frequency: "daily",
          schemaMode: "additive",
        },
      });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.scheduledImportId).toBeDefined();

      // Verify scheduled import was created
      expect(mocks.mockPayload.create).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "scheduled-imports",
          data: expect.objectContaining({
            name: "Daily Import",
            sourceUrl: "https://example.com/data.csv",
            catalog: 1,
            enabled: true,
            scheduleType: "frequency",
            frequency: "daily",
            schemaMode: "additive",
          }),
        })
      );

      // Verify dataset schema config was updated for schedule
      expect(mocks.mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          data: expect.objectContaining({
            schemaConfig: expect.objectContaining({ locked: false, autoGrow: true, autoApproveNonBreaking: true }),
          }),
        })
      );
    });

    it("should check quota before creating scheduled import (Bug 15)", async () => {
      const req = createRequest({
        ...baseBody,
        createSchedule: {
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          name: "Daily Import",
          scheduleType: "frequency",
          frequency: "daily",
          schemaMode: "additive",
        },
      });

      await POST(req, {} as never);

      // Verify quota was checked
      expect(mocks.mockValidateQuota).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "maxActiveSchedules", 1);
    });

    it("should return 429 when scheduled import quota is exceeded (Bug 15)", async () => {
      // Import the mock QuotaExceededError from the mocked module
      const { QuotaExceededError } = await import("@/lib/services/quota-service");
      mocks.mockValidateQuota.mockRejectedValue(new QuotaExceededError("maxActiveSchedules", 5, 5));

      const req = createRequest({
        ...baseBody,
        createSchedule: {
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          name: "Daily Import",
          scheduleType: "frequency",
          frequency: "daily",
          schemaMode: "additive",
        },
      });

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(429);
      expect(body.code).toBe("QUOTA_EXCEEDED");
    });

    it("should not create scheduled import when createSchedule is not provided", async () => {
      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.scheduledImportId).toBeUndefined();

      // Verify scheduled-imports was NOT called
      const scheduledImportCalls = mocks.mockPayload.create.mock.calls.filter(
        (call: unknown[]) => (call[0] as Record<string, unknown>).collection === "scheduled-imports"
      );
      expect(scheduledImportCalls).toHaveLength(0);
    });
  });

  describe("Schema Mode Translation", () => {
    const createScheduleRequest = (schemaMode: string) =>
      createRequest({
        ...baseBody,
        createSchedule: {
          enabled: true,
          sourceUrl: "https://example.com/data.csv",
          name: "Scheduled Import",
          scheduleType: "frequency",
          frequency: "daily",
          schemaMode,
        },
      });

    it("should translate 'strict' mode correctly", async () => {
      const req = createScheduleRequest("strict");

      await POST(req, {} as never);

      expect(mocks.mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          data: expect.objectContaining({
            schemaConfig: { locked: true, autoGrow: false, autoApproveNonBreaking: false },
          }),
        })
      );
    });

    it("should translate 'additive' mode correctly", async () => {
      const req = createScheduleRequest("additive");

      await POST(req, {} as never);

      expect(mocks.mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          data: expect.objectContaining({
            schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: true },
          }),
        })
      );
    });

    it("should translate 'flexible' mode correctly", async () => {
      const req = createScheduleRequest("flexible");

      await POST(req, {} as never);

      expect(mocks.mockPayload.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collection: "datasets",
          data: expect.objectContaining({
            schemaConfig: { locked: false, autoGrow: true, autoApproveNonBreaking: false },
          }),
        })
      );
    });
  });

  describe("Error Handling", () => {
    it("should return 500 when an unexpected error occurs", async () => {
      mocks.mockGetPayload.mockRejectedValue(new Error("Database connection failed"));

      const req = createRequest(baseBody);

      const response = await POST(req, {} as never);
      const body = await response.json();

      expect(response.status).toBe(500);
      // Error is caught by the apiRoute framework's outer handler
      expect(body.error).toBe("Internal server error");
      expect(body.code).toBe("INTERNAL_ERROR");
    });
  });
});

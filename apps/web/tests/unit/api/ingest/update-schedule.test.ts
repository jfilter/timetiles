// @vitest-environment node
/**
 * Unit tests for the update-schedule API route.
 *
 * Covers the transaction wrapping around dataset updates + the final
 * scheduled-ingest update: a failure in the last step must roll back the
 * dataset writes rather than leaving them partially applied.
 *
 * @module
 * @category Tests
 */

// 1. Centralized mocks FIRST
import "@/tests/mocks/services/logger";
import "@/tests/mocks/services/site-resolver";

// 2. vi.hoisted for values needed in vi.mock factories
const mocks = vi.hoisted(() => ({
  mockPayload: { update: vi.fn(), findByID: vi.fn(), auth: vi.fn() },
  mockGetPayload: vi.fn(),
  mockInitTransaction: vi.fn(),
  mockCommitTransaction: vi.fn(),
  mockKillTransaction: vi.fn(),
  mockIsFeatureEnabled: vi.fn(),
  mockProcessSheetMappings: vi.fn(),
  mockGetOrCreateCatalog: vi.fn(),
  mockLoadPreviewMetadata: vi.fn(),
  mockValidateRequest: vi.fn(),
  mockCleanupPreview: vi.fn(),
  mockParseFileSheets: vi.fn(),
}));

// 3. vi.mock calls
vi.mock("payload", () => ({
  getPayload: mocks.mockGetPayload,
  initTransaction: mocks.mockInitTransaction,
  commitTransaction: mocks.mockCommitTransaction,
  killTransaction: mocks.mockKillTransaction,
}));
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/payload.config", () => ({ default: {} }));

vi.mock("@/lib/middleware/auth", () => ({}));

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: mocks.mockIsFeatureEnabled }),
}));

vi.mock("@/lib/middleware/rate-limit", () => ({ checkRateLimit: vi.fn(() => Promise.resolve(null)) }));

vi.mock("@/lib/ingest/configure-service", () => ({
  processSheetMappings: mocks.mockProcessSheetMappings,
  getOrCreateCatalog: mocks.mockGetOrCreateCatalog,
  translateSchemaMode: vi.fn(() => ({ mode: "flexible" })),
}));

vi.mock("@/lib/ingest/preview-store", () => ({
  loadPreviewMetadata: mocks.mockLoadPreviewMetadata,
  cleanupPreview: mocks.mockCleanupPreview,
}));

vi.mock("@/lib/ingest/preview-validation", () => ({ validateRequest: mocks.mockValidateRequest }));

vi.mock("@/app/api/ingest/preview-schema/helpers", () => ({ parseFileSheets: mocks.mockParseFileSheets }));

// 4. Vitest imports and source code AFTER mocks
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PATCH } from "@/app/api/ingest/update-schedule/route";
import type { AuthenticatedRequest } from "@/lib/middleware/auth";
import { TEST_EMAILS } from "@/tests/constants/test-credentials";

const VALID_UUID = "12345678-1234-4123-8123-123456789abc";
const mockUser = { id: 1, email: TEST_EMAILS.user, role: "user" };

const basePreviewMeta = {
  previewId: VALID_UUID,
  userId: 1,
  originalName: "events.csv",
  // eslint-disable-next-line sonarjs/publicly-writable-directories
  filePath: "/tmp/timetiles-wizard-preview/test-file.csv",
  mimeType: "text/csv",
  fileSize: 1024,
  sourceUrl: null,
  createdAt: "2024-01-01T00:00:00Z",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

const baseBody = {
  scheduledIngestId: 10,
  previewId: VALID_UUID,
  catalogId: 1,
  sheetMappings: [{ sheetIndex: 0, datasetId: "new" as const, newDatasetName: "Test Dataset" }],
  fieldMappings: [
    {
      sheetIndex: 0,
      titleField: "title",
      descriptionField: "description",
      dateField: "date",
      idField: null,
      idStrategy: "content-hash" as const,
      locationField: "location",
      latitudeField: "lat",
      longitudeField: "lng",
    },
  ],
  deduplicationStrategy: "skip" as const,
  geocodingEnabled: true,
  transforms: [],
  scheduleConfig: {
    name: "Test Schedule",
    scheduleType: "frequency" as const,
    frequency: "daily",
    schemaMode: "flexible",
  },
  authConfig: undefined,
  jsonApiConfig: undefined,
};

const routeContext = { params: Promise.resolve({}) };

const createRequest = (body: Record<string, unknown>) => {
  mocks.mockPayload.auth.mockResolvedValue({ user: mockUser });
  return {
    user: mockUser,
    headers: new Headers({ host: "localhost" }),
    url: "http://localhost/api/ingest/update-schedule",
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as AuthenticatedRequest;
};

describe.sequential("PATCH /api/ingest/update-schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.mockGetPayload.mockResolvedValue(mocks.mockPayload);
    mocks.mockPayload.auth.mockResolvedValue({ user: mockUser });

    mocks.mockPayload.findByID.mockResolvedValue({
      id: 10,
      createdBy: mockUser.id,
      advancedOptions: {},
      sourceUrl: "https://example.com/data.csv",
      lastStatus: "success",
    });

    mocks.mockIsFeatureEnabled.mockResolvedValue(true);
    mocks.mockLoadPreviewMetadata.mockReturnValue(basePreviewMeta);
    mocks.mockValidateRequest.mockReturnValue(undefined);
    mocks.mockParseFileSheets.mockResolvedValue([
      { index: 0, name: "Sheet1", rowCount: 3, headers: ["title", "description", "date", "location", "lat", "lng"] },
    ]);
    mocks.mockGetOrCreateCatalog.mockResolvedValue(1);
    mocks.mockProcessSheetMappings.mockResolvedValue({
      datasetMappingEntries: [{ dataset: 42, sheetIdentifier: "Sheet1" }],
      datasetIdMap: new Map([["Sheet1", 42]]),
    });

    // initTransaction "owns" the transaction by default (no pre-existing one on req)
    mocks.mockInitTransaction.mockResolvedValue(true);
    mocks.mockCommitTransaction.mockResolvedValue(undefined);
    mocks.mockKillTransaction.mockResolvedValue(undefined);

    mocks.mockPayload.update.mockResolvedValue({ id: 42 });
  });

  it("commits the transaction when every step succeeds", async () => {
    const req = createRequest(baseBody);

    const response = await PATCH(req, routeContext);

    expect(response.status).toBe(200);
    expect(mocks.mockCommitTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.mockKillTransaction).not.toHaveBeenCalled();
  });

  it("rolls back the dataset update when the final scheduled-ingest update fails", async () => {
    // The dataset schema update succeeds, but the closing scheduled-ingest
    // update fails — without a shared transaction this would leave the
    // dataset change persisted while the API reports failure.
    mocks.mockPayload.update.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "datasets") return { id: 42 };
      if (collection === "scheduled-ingests") throw new Error("simulated DB failure");
      return {};
    });

    const req = createRequest(baseBody);
    const response = await PATCH(req, routeContext);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mocks.mockKillTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.mockCommitTransaction).not.toHaveBeenCalled();
  });
});

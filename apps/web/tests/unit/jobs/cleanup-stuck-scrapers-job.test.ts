/**
 * Unit tests for cleanup stuck scrapers job.
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoggerInfo, mockLoggerDebug, mockLoggerWarn, mockLoggerError, mockLogError } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLogError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mockLoggerInfo, warn: mockLoggerWarn, error: mockLoggerError, debug: mockLoggerDebug },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: mockLogError,
}));

const mockIsFeatureEnabled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/feature-flag-service", () => ({ isFeatureEnabled: mockIsFeatureEnabled }));

const mockIsResourceStuck = vi.hoisted(() => vi.fn());
const mockHasActivePayloadJob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/jobs/utils/stuck-detection", () => ({
  isResourceStuck: mockIsResourceStuck,
  hasActivePayloadJob: mockHasActivePayloadJob,
}));

vi.mock("@/lib/utils/date", () => ({ parseDateInput: vi.fn((input: string) => new Date(input)) }));

import { cleanupStuckScrapersJob } from "@/lib/jobs/handlers/cleanup-stuck-scrapers-job";

describe.sequential("cleanupStuckScrapersJob", () => {
  let mockPayload: {
    find: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findByID: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  const createMockContext = (input: Record<string, unknown> = {}) => ({
    req: { payload: mockPayload },
    job: { id: "cleanup-job-1", input },
    input,
  });

  const createMockScraper = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: "Test Scraper",
    lastRunStatus: "running",
    lastRunAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    statistics: { totalRuns: 5, successRuns: 4, failedRuns: 1 },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      find: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      findByID: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    };

    // Defaults: feature enabled, resource stuck, no active job
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockIsResourceStuck.mockReturnValue(true);
    mockHasActivePayloadJob.mockResolvedValue(false);
  });

  it("should return skipped when scrapers feature is disabled", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const context = createMockContext();
    const result = await cleanupStuckScrapersJob.handler(context as any);

    expect(result).toEqual({ output: { success: true, skipped: true, reason: "Scrapers feature disabled" } });
    expect(mockPayload.find).not.toHaveBeenCalled();
  });

  it("should return all-zero counts when no scrapers are running", async () => {
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });

    const context = createMockContext();
    const result = await cleanupStuckScrapersJob.handler(context as any);

    expect(result.output).toEqual({ success: true, totalRunning: 0, stuckCount: 0, resetCount: 0, dryRun: false });
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("should reset a stuck scraper with no active Payload job", async () => {
    const scraper = createMockScraper();
    mockPayload.find.mockResolvedValue({ docs: [scraper], totalDocs: 1 });

    const context = createMockContext();
    const result = await cleanupStuckScrapersJob.handler(context as any);

    expect(result.output).toEqual(
      expect.objectContaining({ success: true, totalRunning: 1, stuckCount: 1, resetCount: 1, dryRun: false })
    );

    // Verify the scraper was updated to failed with incremented failedRuns
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "scrapers",
      id: 1,
      overrideAccess: true,
      data: { lastRunStatus: "failed", statistics: expect.objectContaining({ failedRuns: 2 }) },
    });
  });

  it("should skip a scraper that has an active Payload job", async () => {
    const scraper = createMockScraper();
    mockPayload.find.mockResolvedValue({ docs: [scraper], totalDocs: 1 });
    mockHasActivePayloadJob.mockResolvedValue(true);

    const context = createMockContext();
    const result = await cleanupStuckScrapersJob.handler(context as any);

    expect(result.output).toEqual(
      expect.objectContaining({ success: true, totalRunning: 1, stuckCount: 0, resetCount: 0 })
    );
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("should increment stuckCount but not resetCount in dryRun mode", async () => {
    const scraper = createMockScraper();
    mockPayload.find.mockResolvedValue({ docs: [scraper], totalDocs: 1 });

    const context = createMockContext({ dryRun: true });
    const result = await cleanupStuckScrapersJob.handler(context as any);

    expect(result.output).toEqual(
      expect.objectContaining({ success: true, totalRunning: 1, stuckCount: 1, resetCount: 0, dryRun: true })
    );
    expect(mockPayload.update).not.toHaveBeenCalled();
  });

  it("should log per-scraper errors and continue processing", async () => {
    const scraper1 = createMockScraper({ id: 1, name: "Scraper 1" });
    const scraper2 = createMockScraper({ id: 2, name: "Scraper 2" });
    mockPayload.find.mockResolvedValue({ docs: [scraper1, scraper2], totalDocs: 2 });

    // First update fails, second succeeds
    mockPayload.update.mockRejectedValueOnce(new Error("DB timeout")).mockResolvedValueOnce({});

    const context = createMockContext();
    const result = await cleanupStuckScrapersJob.handler(context as any);

    const output = result.output as { resetCount: number; errors: Array<{ id: string; name: string; error: string }> };
    expect(output.resetCount).toBe(1);
    expect(output.errors).toHaveLength(1);
    expect(output.errors[0]).toEqual({ id: "1", name: "Scraper 1", error: "DB timeout" });
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      "Failed to process scraper in cleanup",
      expect.objectContaining({ scraperId: 1 })
    );
  });

  it("should throw when the overall job fails", async () => {
    const dbError = new Error("Database connection failed");
    mockPayload.find.mockRejectedValue(dbError);

    const context = createMockContext();

    await expect(cleanupStuckScrapersJob.handler(context as any)).rejects.toThrow("Database connection failed");

    expect(mockLogError).toHaveBeenCalledWith(dbError, "Cleanup stuck scrapers job failed", expect.any(Object));
  });
});

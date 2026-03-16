/**
 * Unit tests for scraper scheduling within the Schedule Manager Job Handler.
 *
 * Tests the processScheduledScrapers() and shouldScraperRunNow() logic
 * that runs as part of the main schedule-manager job handler.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scheduleManagerJob } from "@/lib/jobs/handlers/schedule-manager-job";

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: vi.fn(() => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  logError: vi.fn(),
}));

const mockIsFeatureEnabled = vi.fn();

vi.mock("@/lib/services/feature-flag-service", () => ({
  isFeatureEnabled: (...args: unknown[]) => mockIsFeatureEnabled(...args),
}));

vi.mock("@/lib/services/scheduled-import-trigger-service", () => ({
  triggerScheduledImport: vi.fn().mockResolvedValue(undefined),
}));

const mockClaimScraperRunning = vi.fn();

vi.mock("@/lib/services/webhook-registry", () => ({
  claimScraperRunning: (...args: unknown[]) => mockClaimScraperRunning(...args),
}));

describe.sequential("scheduleManagerJob — scraper scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // By default: scheduled job execution enabled, scrapers enabled
    mockIsFeatureEnabled.mockImplementation((_payload: unknown, flag: string) => {
      if (flag === "enableScheduledJobExecution") return Promise.resolve(true);
      if (flag === "enableScrapers") return Promise.resolve(true);
      return Promise.resolve(false);
    });

    // By default: atomic claim succeeds
    mockClaimScraperRunning.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createMockContext = () => {
    const mockPayload = {
      find: vi.fn(),
      findByID: vi.fn(),
      update: vi.fn(),
      jobs: { queue: vi.fn().mockResolvedValue({ id: "scraper-exec-job-1" }) },
    };

    const mockJob = { id: "schedule-job-123" };
    const mockReq = { payload: mockPayload as any };

    return { mockPayload, mockJob, mockReq };
  };

  /**
   * Helper: configure mockPayload.find so scheduled imports return empty
   * and scrapers return the provided docs.
   */
  const setupScrapersOnly = (mockPayload: ReturnType<typeof createMockContext>["mockPayload"], scraperDocs: any[]) => {
    mockPayload.find.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "scheduled-imports") {
        return Promise.resolve({ docs: [], totalDocs: 0 });
      }
      if (collection === "scrapers") {
        return Promise.resolve({ docs: scraperDocs, totalDocs: scraperDocs.length });
      }
      return Promise.resolve({ docs: [], totalDocs: 0 });
    });
  };

  it("should skip scraper processing when enableScrapers flag is off", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    mockIsFeatureEnabled.mockImplementation((_payload: unknown, flag: string) => {
      if (flag === "enableScheduledJobExecution") return Promise.resolve(true);
      if (flag === "enableScrapers") return Promise.resolve(false);
      return Promise.resolve(false);
    });

    // Scheduled imports: none
    mockPayload.find.mockResolvedValue({ docs: [], totalDocs: 0 });

    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));

    const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    // The scrapers find call should not happen since feature is disabled
    const scraperFindCalls = mockPayload.find.mock.calls.filter(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scrapers"
    );
    expect(scraperFindCalls).toHaveLength(0);

    expect(result.output.scrapersTriggered).toBe(0);
    expect(result.output.scraperErrors).toBe(0);
  });

  it("should query enabled scrapers with a schedule field", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    vi.setSystemTime(new Date("2026-03-15T10:00:00Z"));

    setupScrapersOnly(mockPayload, []);

    await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    // Verify the scrapers query uses the correct where clause
    const scraperFindCall = mockPayload.find.mock.calls.find(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scrapers"
    );
    expect(scraperFindCall).toBeDefined();
    expect(scraperFindCall![0]).toEqual({
      collection: "scrapers",
      where: { and: [{ enabled: { equals: true } }, { schedule: { exists: true } }] },
      limit: 1000,
      pagination: false,
      overrideAccess: true,
    });
  });

  it("should skip scrapers when atomic claim fails (concurrency guard)", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"));

    const runningScraper = {
      id: 1,
      name: "Running Scraper",
      enabled: true,
      schedule: "0 * * * *",
      nextRunAt: "2026-03-15T11:00:00Z", // past due
      lastRunStatus: "running",
    };

    setupScrapersOnly(mockPayload, [runningScraper]);

    // Atomic claim fails — scraper is already running
    mockClaimScraperRunning.mockResolvedValueOnce(false);

    const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    expect(mockClaimScraperRunning).toHaveBeenCalledWith(expect.anything(), 1);
    expect(mockPayload.jobs.queue).not.toHaveBeenCalledWith(expect.objectContaining({ task: "scraper-execution" }));
    expect(result.output.scrapersTriggered).toBe(0);
  });

  it("should queue scraper-execution job for scrapers that are due", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    vi.setSystemTime(new Date("2026-03-15T12:05:00Z"));

    const dueScraper = {
      id: 42,
      name: "Due Scraper",
      enabled: true,
      schedule: "0 * * * *",
      nextRunAt: "2026-03-15T12:00:00Z", // 5 minutes ago — due
      lastRunStatus: "success",
    };

    setupScrapersOnly(mockPayload, [dueScraper]);

    const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    expect(mockPayload.jobs.queue).toHaveBeenCalledWith({
      task: "scraper-execution",
      input: { scraperId: 42, triggeredBy: "schedule" },
    });
    expect(result.output.scrapersTriggered).toBe(1);
  });

  it("should update nextRunAt after triggering a scraper", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    vi.setSystemTime(new Date("2026-03-15T12:05:00Z"));

    const dueScraper = {
      id: 7,
      name: "Hourly Scraper",
      enabled: true,
      schedule: "0 * * * *",
      nextRunAt: "2026-03-15T12:00:00Z",
      lastRunStatus: "success",
    };

    setupScrapersOnly(mockPayload, [dueScraper]);

    await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    // Should update the scraper with a new nextRunAt
    expect(mockPayload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scrapers",
        id: 7,
        overrideAccess: true,
        data: expect.objectContaining({ nextRunAt: expect.any(String) }),
      })
    );

    // The nextRunAt should be in the future relative to currentTime
    const updateCall = mockPayload.update.mock.calls.find(
      (call: unknown[]) => (call[0] as { collection: string }).collection === "scrapers"
    );
    expect(updateCall).toBeDefined();
    const nextRunAt = new Date((updateCall![0] as { data: { nextRunAt: string } }).data.nextRunAt);
    expect(nextRunAt.getTime()).toBeGreaterThan(new Date("2026-03-15T12:05:00Z").getTime());
  });

  it("should handle scraper processing errors without failing the main job", async () => {
    const { mockPayload, mockJob, mockReq } = createMockContext();

    vi.setSystemTime(new Date("2026-03-15T12:05:00Z"));

    const errorScraper = {
      id: 99,
      name: "Error Scraper",
      enabled: true,
      schedule: "0 * * * *",
      nextRunAt: "2026-03-15T12:00:00Z",
      lastRunStatus: "success",
    };

    setupScrapersOnly(mockPayload, [errorScraper]);

    // Make the queue call throw
    mockPayload.jobs.queue.mockRejectedValueOnce(new Error("Queue failed"));

    const result = await scheduleManagerJob.handler({ job: mockJob, req: mockReq });

    // The main job should still succeed, but report a scraper error
    expect(result.output.success).toBe(true);
    expect(result.output.scraperErrors).toBe(1);
    expect(result.output.scrapersTriggered).toBe(0);
  });
});

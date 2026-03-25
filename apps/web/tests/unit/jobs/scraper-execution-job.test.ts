/**
 * Unit tests for Scraper Execution Job Handler.
 *
 * Tests the scraper-execution job which loads a scraper definition,
 * calls the runner API, records results, and manages quota usage.
 *
 * @module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnv } from "@/lib/config/env";
import { scraperExecutionJob } from "@/lib/jobs/handlers/scraper-execution-job";

const mockIsEnabled = vi.hoisted(() => vi.fn().mockResolvedValue(true));

// Mock dependencies
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

vi.mock("@/lib/services/feature-flag-service", () => ({
  getFeatureFlagService: vi.fn().mockReturnValue({ isEnabled: mockIsEnabled }),
}));

vi.mock("@/lib/services/quota-service", () => ({ createQuotaService: vi.fn() }));

vi.mock("uuid", () => ({ v4: vi.fn().mockReturnValue("test-uuid-1234") }));

describe.sequential("scraperExecutionJob", () => {
  let mockPayload: any;
  let mockQuotaService: any;
  const originalFetch = globalThis.fetch;

  const createMockContext = (input: { scraperId: number; triggeredBy: string }) => ({
    req: { payload: mockPayload },
    job: { id: "exec-job-1" },
    input,
  });

  const createMockScraper = (overrides: Record<string, unknown> = {}) => ({
    id: 10,
    name: "Test Scraper",
    enabled: true,
    runtime: "python",
    entrypoint: "main.py",
    outputFile: "data.csv",
    timeoutSecs: 300,
    memoryMb: 512,
    envVars: {},
    schedule: "0 * * * *",
    autoImport: false,
    statistics: { totalRuns: 5, successRuns: 4, failedRuns: 1 },
    repo: {
      id: 20,
      sourceType: "git",
      gitUrl: "https://github.com/user/repo.git",
      gitBranch: "main",
      catalog: 100,
      createdBy: 200,
    },
    ...overrides,
  });

  const createMockRunnerResponse = (overrides: Record<string, unknown> = {}) => ({
    status: "success",
    exit_code: 0,
    duration_ms: 1500,
    stdout: "Scraping complete",
    stderr: "",
    output: { rows: 42, bytes: 2048, download_url: "/output/test-uuid-1234/data.csv" },
    ...overrides,
  });

  const createSuccessFetchMock = () =>
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(createMockRunnerResponse()),
        text: vi.fn().mockResolvedValue(""),
      });

  const createFailureFetchMock = (status: number = 500, body: string = "Internal Server Error") =>
    vi.fn().mockResolvedValue({ ok: false, status, text: vi.fn().mockResolvedValue(body) });

  beforeEach(async () => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: 1 }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      jobs: { queue: vi.fn().mockResolvedValue({ id: "queued-job-1" }) },
    };

    mockQuotaService = {
      checkAndIncrementUsage: vi.fn().mockResolvedValue(true),
      decrementUsage: vi.fn().mockResolvedValue(undefined),
    };

    // Re-apply mocks after clearAllMocks
    mockIsEnabled.mockResolvedValue(true);

    const { createQuotaService } = await import("@/lib/services/quota-service");
    (createQuotaService as any).mockReturnValue(mockQuotaService);

    const { v4 } = await import("uuid");
    (v4 as any).mockReturnValue("test-uuid-1234");

    // Default: findByID returns a scraper with populated repo
    mockPayload.findByID.mockImplementation(({ collection }: { collection: string }) => {
      if (collection === "scrapers") {
        return Promise.resolve(createMockScraper());
      }
      if (collection === "users") {
        return Promise.resolve({ id: 200, email: "owner@example.com" });
      }
      return Promise.resolve(null);
    });

    // Default: successful runner response via global fetch
    globalThis.fetch = createSuccessFetchMock();

    // Set env vars for runner
    process.env.SCRAPER_RUNNER_URL = "https://runner.example.com";
    process.env.SCRAPER_API_KEY = "test-api-key";
    resetEnv();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should return early when enableScrapers flag is off", async () => {
    mockIsEnabled.mockResolvedValue(false);

    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });

    await expect(scraperExecutionJob.handler(context as any)).rejects.toThrow(
      "Feature flag enableScrapers is disabled"
    );

    // Should not load the scraper or call the runner
    expect(mockPayload.findByID).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should load scraper with depth:1 to populate repo", async () => {
    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });
    await scraperExecutionJob.handler(context as any);

    expect(mockPayload.findByID).toHaveBeenCalledWith({
      collection: "scrapers",
      id: 10,
      depth: 1,
      overrideAccess: true,
    });
  });

  it("should create scraper-run record with 'running' status", async () => {
    const context = createMockContext({ scraperId: 10, triggeredBy: "schedule" });
    await scraperExecutionJob.handler(context as any);

    expect(mockPayload.create).toHaveBeenCalledWith({
      collection: "scraper-runs",
      overrideAccess: true,
      data: expect.objectContaining({
        scraper: 10,
        scraperOwner: 200,
        status: "running",
        triggeredBy: "schedule",
        startedAt: expect.any(String),
      }),
    });

    // Also verify the scraper itself is marked as running
    expect(mockPayload.update).toHaveBeenCalledWith({
      collection: "scrapers",
      id: 10,
      overrideAccess: true,
      data: { lastRunStatus: "running" },
    });
  });

  it("should build correct runner API request from scraper + repo config", async () => {
    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });
    await scraperExecutionJob.handler(context as any);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://runner.example.com/run",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json", Authorization: "Bearer test-api-key" }),
        body: expect.any(String),
      })
    );

    // Parse the request body to verify its structure
    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    expect(body).toEqual({
      run_id: "test-uuid-1234",
      runtime: "python",
      entrypoint: "main.py",
      output_file: "data.csv",
      code_url: "https://github.com/user/repo.git#main",
      env: {},
      limits: { timeout_secs: 300, memory_mb: 512 },
    });
  });

  it("should update run record with success result (status, duration, output rows)", async () => {
    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });
    await scraperExecutionJob.handler(context as any);

    // Find the update call for scraper-runs that sets the result
    const runUpdateCalls = mockPayload.update.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as { collection: string; data?: { status?: string } };
      return arg.collection === "scraper-runs" && arg.data?.status === "success";
    });

    expect(runUpdateCalls).toHaveLength(1);
    expect(runUpdateCalls[0][0]).toEqual(
      expect.objectContaining({
        collection: "scraper-runs",
        id: 1, // the run record ID returned by create
        overrideAccess: true,
        data: expect.objectContaining({
          status: "success",
          finishedAt: expect.any(String),
          durationMs: 1500,
          exitCode: 0,
          stdout: "Scraping complete",
          stderr: "",
          outputRows: 42,
          outputBytes: 2048,
        }),
      })
    );
  });

  it("should update scraper statistics on successful run", async () => {
    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });
    await scraperExecutionJob.handler(context as any);

    // Find the scraper update that sets statistics (not the "running" status update)
    const statsUpdateCalls = mockPayload.update.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as { collection: string; data?: { statistics?: unknown } };
      return arg.collection === "scrapers" && arg.data?.statistics !== undefined;
    });

    expect(statsUpdateCalls).toHaveLength(1);
    expect(statsUpdateCalls[0][0]).toEqual(
      expect.objectContaining({
        collection: "scrapers",
        id: 10,
        overrideAccess: true,
        data: expect.objectContaining({
          lastRunAt: expect.any(String),
          lastRunStatus: "success",
          statistics: expect.objectContaining({
            totalRuns: 6, // was 5
            successRuns: 5, // was 4
            failedRuns: 1, // unchanged
          }),
        }),
      })
    );
  });

  it("should handle runner API failure — updates run and scraper to 'failed'", async () => {
    globalThis.fetch = createFailureFetchMock(500, "Internal Server Error");

    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });

    await expect(scraperExecutionJob.handler(context as any)).rejects.toThrow("Runner API returned 500");

    // Verify run record updated to failed
    const runFailCalls = mockPayload.update.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as { collection: string; data?: { status?: string; error?: string } };
      return arg.collection === "scraper-runs" && arg.data?.status === "failed";
    });
    expect(runFailCalls).toHaveLength(1);
    expect(runFailCalls[0][0].data).toEqual(
      expect.objectContaining({
        status: "failed",
        finishedAt: expect.any(String),
        error: expect.stringContaining("Runner API returned 500"),
      })
    );

    // Verify scraper updated to failed with incremented failedRuns
    const scraperFailCalls = mockPayload.update.mock.calls.filter((call: unknown[]) => {
      const arg = call[0] as { collection: string; data?: { lastRunStatus?: string } };
      return arg.collection === "scrapers" && arg.data?.lastRunStatus === "failed";
    });
    expect(scraperFailCalls).toHaveLength(1);
    expect(scraperFailCalls[0][0].data).toEqual(
      expect.objectContaining({
        lastRunStatus: "failed",
        statistics: expect.objectContaining({
          totalRuns: 6,
          failedRuns: 2, // was 1
        }),
      })
    );
  });

  it("should roll back SCRAPER_RUNS_PER_DAY quota on failure", async () => {
    globalThis.fetch = createFailureFetchMock(500, "Server error");

    const context = createMockContext({ scraperId: 10, triggeredBy: "manual" });

    await expect(scraperExecutionJob.handler(context as any)).rejects.toThrow();

    // Quota was incremented before the run
    expect(mockQuotaService.checkAndIncrementUsage).toHaveBeenCalledTimes(1);

    // On failure, quota should be rolled back
    expect(mockQuotaService.decrementUsage).toHaveBeenCalledWith(
      200, // repoOwnerId
      "SCRAPER_RUNS_PER_DAY",
      1
    );
  });
});

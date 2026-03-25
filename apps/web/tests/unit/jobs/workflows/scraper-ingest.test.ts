/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scraperIngestWorkflow } from "@/lib/jobs/workflows/scraper-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = scraperIngestWorkflow.handler as WorkflowHandler<"scraper-ingest">;

// Mock processSheets so we can verify it's called without running the real pipeline
vi.mock("@/lib/jobs/workflows/process-sheets", () => ({ processSheets: vi.fn().mockResolvedValue(undefined) }));

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({ updateIngestFileStatus: vi.fn().mockResolvedValue(undefined) }));

import { processSheets } from "@/lib/jobs/workflows/process-sheets";

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "scraper-execution": vi.fn().mockResolvedValue({ ingestFileId: "scraper-file-1", hasOutput: true }),
  "dataset-detection": vi
    .fn()
    .mockResolvedValue({
      sheetsDetected: 1,
      ingestJobsCreated: 1,
      sheets: [{ index: 0, ingestJobId: "ij-scrape-1", name: "Sheet1", rowCount: 75 }],
    }),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "create-schema-version": vi.fn(),
  "geocode-batch": vi.fn(),
  "create-events": vi.fn(),
  "url-fetch": vi.fn(),
});

describe.sequential("scraperIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-scraper-1", input: { scraperId: 7, triggeredBy: "manual" } };
  });

  // ── 1. Happy path — scraper succeeds, detection, sheets processed ─────

  it("should run scraper, detection, then process sheets on happy path", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // scraper-execution called with correct input
    expect(tasks["scraper-execution"]).toHaveBeenCalledOnce();
    expect(tasks["scraper-execution"]).toHaveBeenCalledWith("run-scraper", {
      input: { scraperId: 7, triggeredBy: "manual" },
    });

    // dataset-detection called with ingestFileId from scraper
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", {
      input: { ingestFileId: "scraper-file-1" },
    });

    // processSheets called with detected sheets
    expect(processSheets).toHaveBeenCalledOnce();
    expect(processSheets).toHaveBeenCalledWith(
      tasks,
      [{ index: 0, ingestJobId: "ij-scrape-1", name: "Sheet1", rowCount: 75 }],
      expect.anything()
    );
  });

  // ── 2. Scraper fails — no detection ───────────────────────────────────

  it("should stop when scraper-execution throws", async () => {
    tasks["scraper-execution"].mockRejectedValueOnce(new Error("container timeout"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("container timeout");

    expect(tasks["scraper-execution"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 3. Scraper succeeds but no ingestFileId (no autoImport) ───────────

  it("should stop when scraper returns no ingestFileId", async () => {
    tasks["scraper-execution"].mockResolvedValueOnce({ hasOutput: true });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["scraper-execution"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 4. Detection fails — no sheets ────────────────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("no parseable content"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("no parseable content");

    expect(tasks["scraper-execution"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 5. Verify concurrency key format ──────────────────────────────────

  it("should produce global concurrency key ingest-pipeline", () => {
    const concurrency = scraperIngestWorkflow.concurrency as () => string;
    const key = concurrency();

    expect(key).toBe("ingest-pipeline");
  });

  // ── 6. Scraper returns numeric ingestFileId — converted to string ─────

  it("should convert numeric ingestFileId to string for detection", async () => {
    tasks["scraper-execution"].mockResolvedValueOnce({ ingestFileId: 999, hasOutput: true });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "999" } });
  });

  // ── 7. Detection returns empty sheets — no processing ─────────────────

  it("should stop when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["scraper-execution"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });
});

/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scheduledIngestWorkflow } from "@/lib/jobs/workflows/scheduled-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = scheduledIngestWorkflow.handler as WorkflowHandler<"scheduled-ingest">;

// Mock processSheets so we can verify it's called without running the real pipeline
vi.mock("@/lib/jobs/workflows/process-sheets", () => ({ processSheets: vi.fn().mockResolvedValue(undefined) }));

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({ updateIngestFileStatus: vi.fn().mockResolvedValue(undefined) }));

import { processSheets } from "@/lib/jobs/workflows/process-sheets";

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "url-fetch": vi.fn().mockResolvedValue({ ingestFileId: "fetched-file-1" }),
  "dataset-detection": vi
    .fn()
    .mockResolvedValue({
      sheetsDetected: 1,
      ingestJobsCreated: 1,
      sheets: [{ index: 0, ingestJobId: "ij-1", name: "Sheet1", rowCount: 200 }],
    }),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "create-schema-version": vi.fn(),
  "geocode-batch": vi.fn(),
  "create-events": vi.fn(),
  "scraper-execution": vi.fn(),
});

describe.sequential("scheduledIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = {
      id: "wf-sched-1",
      input: {
        scheduledIngestId: 42,
        sourceUrl: "https://example.com/data.csv",
        authConfig: null,
        catalogId: "cat-1",
        originalName: "data.csv",
        userId: "user-1",
        triggeredBy: "schedule",
      },
    };
  });

  // ── 1. Happy path — fetch, detection, sheets processed ────────────────

  it("should run fetch, detection, then process sheets on happy path", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // url-fetch called with all input fields
    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["url-fetch"]).toHaveBeenCalledWith("fetch-url", {
      input: {
        scheduledIngestId: 42,
        sourceUrl: "https://example.com/data.csv",
        authConfig: null,
        catalogId: "cat-1",
        originalName: "data.csv",
        userId: "user-1",
        triggeredBy: "schedule",
      },
    });

    // dataset-detection called with ingestFileId from fetch
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", {
      input: { ingestFileId: "fetched-file-1" },
    });

    // processSheets called with detected sheets
    expect(processSheets).toHaveBeenCalledOnce();
    expect(processSheets).toHaveBeenCalledWith(
      tasks,
      [{ index: 0, ingestJobId: "ij-1", name: "Sheet1", rowCount: 200 }],
      expect.anything()
    );
  });

  // ── 2. Fetch fails — no detection, no sheets ─────────────────────────

  it("should stop when url-fetch throws", async () => {
    tasks["url-fetch"].mockRejectedValueOnce(new Error("404 not found"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("404 not found");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 3. Fetch returns no ingestFileId — no detection ───────────────────

  it("should stop when url-fetch returns no ingestFileId", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({});

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 4. Detection fails — no sheets processed ─────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("unsupported format"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("unsupported format");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 5. Detection returns empty sheets — no sheets processed ───────────

  it("should stop when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 6. Verify concurrency key format ──────────────────────────────────

  it("should produce concurrency key sched:${scheduledIngestId}", () => {
    const concurrency = scheduledIngestWorkflow.concurrency as (args: { input: Record<string, any> }) => string;
    const key = concurrency({ input: { scheduledIngestId: 99 } });

    expect(key).toBe("sched:99");
  });

  // ── 7. Fetch returns numeric ingestFileId — converted to string ───────

  it("should convert numeric ingestFileId to string for detection", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: 12345 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // ingestFileId should be stringified via String()
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "12345" } });
  });
});

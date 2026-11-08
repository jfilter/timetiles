/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { manualIngestWorkflow } from "@/lib/jobs/workflows/manual-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = manualIngestWorkflow.handler as WorkflowHandler<"manual-ingest">;

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  // Payload's tasks[] returns the output directly (not wrapped in { output })
  "dataset-detection": vi.fn().mockResolvedValue({
    sheetsDetected: 2,
    ingestJobsCreated: 2,
    sheets: [
      { index: 0, ingestJobId: 11, name: "Sheet1", rowCount: 50 },
      { index: 1, ingestJobId: 12, name: "Sheet2", rowCount: 30 },
    ],
  }),
  "dispatch-ingest-run": vi.fn().mockResolvedValue({ runId: 5, dispatched: true }),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "create-schema-version": vi.fn(),
  "geocode-batch": vi.fn(),
  "create-events": vi.fn(),
  "url-fetch": vi.fn(),
  "scraper-execution": vi.fn(),
});

describe("manualIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-1", input: { ingestFileId: "42" } };
  });

  // ── 1. Happy path — detection returns sheets, the run is dispatched ────

  it("should run detection then dispatch one run for all sheets", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // dataset-detection called with correct input
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "42" } });

    expect(tasks["dispatch-ingest-run"]).toHaveBeenCalledExactlyOnceWith("dispatch-sheets", {
      input: { ingestFileId: 42, source: "manual", ingestJobIds: [11, 12] },
    });
    // The source workflow only dispatches; per-sheet tasks run in ingest-process children.
    expect(tasks["analyze-duplicates"]).not.toHaveBeenCalled();
  });

  // ── 2. Detection fails — no further tasks ────────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("corrupt file"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("corrupt file");

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
  });

  // ── 3. Detection returns empty sheets array — no further tasks ────────

  it("should stop when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
  });

  // ── 4. Detection returns no sheets property — no further tasks ────────

  it("should stop when detection output has no sheets property", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
  });

  // ── 5. Verify concurrency key format ──────────────────────────────────

  it("should produce per-file concurrency key", () => {
    const concurrency = manualIngestWorkflow.concurrency as (ctx: { input: { ingestFileId: string } }) => string;
    const key = concurrency({ input: { ingestFileId: "file-42" } });

    expect(key).toBe("ingest:manual:file-42");
  });
});

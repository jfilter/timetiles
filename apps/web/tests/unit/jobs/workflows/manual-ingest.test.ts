/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { manualIngestWorkflow } from "@/lib/jobs/workflows/manual-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = manualIngestWorkflow.handler as WorkflowHandler<"manual-ingest">;

// Mock processSheets so we can verify it's called without running the real pipeline
vi.mock("@/lib/jobs/workflows/process-sheets", () => ({ processSheets: vi.fn().mockResolvedValue(undefined) }));

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({ updateIngestFileStatus: vi.fn().mockResolvedValue(undefined) }));

// Import the mock after vi.mock so we can inspect calls
import { processSheets } from "@/lib/jobs/workflows/process-sheets";

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  // Payload's tasks[] returns the output directly (not wrapped in { output })
  "dataset-detection": vi.fn().mockResolvedValue({
    sheetsDetected: 2,
    ingestJobsCreated: 2,
    sheets: [
      { index: 0, ingestJobId: "ij-1", name: "Sheet1", rowCount: 50 },
      { index: 1, ingestJobId: "ij-2", name: "Sheet2", rowCount: 30 },
    ],
  }),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "create-schema-version": vi.fn(),
  "geocode-batch": vi.fn(),
  "create-events": vi.fn(),
  "url-fetch": vi.fn(),
  "scraper-execution": vi.fn(),
});

describe.sequential("manualIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-1", input: { ingestFileId: "file-abc" } };
  });

  // ── 1. Happy path — detection returns sheets, processSheets called ────

  it("should run detection then process sheets on happy path", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // dataset-detection called with correct input
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "file-abc" } });

    // processSheets called with tasks and sheets from detection output
    expect(processSheets).toHaveBeenCalledOnce();
    expect(processSheets).toHaveBeenCalledWith(
      tasks,
      [
        { index: 0, ingestJobId: "ij-1", name: "Sheet1", rowCount: 50 },
        { index: 1, ingestJobId: "ij-2", name: "Sheet2", rowCount: 30 },
      ],
      expect.anything()
    );
  });

  // ── 2. Detection fails — no further tasks ────────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("corrupt file"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any })
    ).rejects.toThrow("corrupt file");

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 3. Detection returns empty sheets array — no further tasks ────────

  it("should stop when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 4. Detection returns no sheets property — no further tasks ────────

  it("should stop when detection output has no sheets property", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
  });

  // ── 5. Verify concurrency key format ──────────────────────────────────

  it("should produce per-file concurrency key", () => {
    const concurrency = manualIngestWorkflow.concurrency as (ctx: { input: { ingestFileId: string } }) => string;
    const key = concurrency({ input: { ingestFileId: "file-42" } });

    expect(key).toBe("ingest:manual:file-42");
  });
});

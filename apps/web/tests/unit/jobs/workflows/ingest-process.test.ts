/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestProcessWorkflow } from "@/lib/jobs/workflows/ingest-process";

// Run reconciliation is covered by its own tests.
vi.mock("@/lib/jobs/utils/reconcile-run", () => ({
  reconcileAfterJobTransition: vi.fn().mockResolvedValue(undefined),
}));

/** A request whose IngestJob is current at generation 0 and awaits its resumption. */
import { reconcileAfterJobTransition } from "@/lib/jobs/utils/reconcile-run";

const currentJobReq = () => ({
  payload: { findByID: vi.fn().mockResolvedValue({ id: 1, generation: 0, stage: "needs-review" }) },
});

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = ingestProcessWorkflow.handler as WorkflowHandler<"ingest-process">;

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "create-schema-version": vi.fn().mockResolvedValue({ schemaVersionId: 10, versionNumber: 3 }),
  "geocode-batch": vi.fn().mockResolvedValue({ geocoded: 50, failed: 0 }),
  "create-events": vi.fn().mockResolvedValue({ eventCount: 50 }),
  "dataset-detection": vi.fn(),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "url-fetch": vi.fn(),
  "scraper-execution": vi.fn(),
});

describe("ingestProcessWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-process-1", input: { ingestJobId: "ij-review-1" } };
  });

  // ── 1. Happy path — all 3 tasks succeed ───────────────────────────────

  it("should run create-schema-version, geocode, create-events in order", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    // create-schema-version called first
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledWith("create-version", {
      input: { ingestJobId: "ij-review-1", generation: 0 },
    });

    // geocode-batch called second
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledWith("geocode", {
      input: { ingestJobId: "ij-review-1", generation: 0, batchNumber: 0 },
    });

    // create-events called third
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events", {
      input: { ingestJobId: "ij-review-1", generation: 0 },
    });
  });

  // ── 2. Create-schema-version fails — geocode and create-events not called

  it("should stop when create-schema-version throws", async () => {
    tasks["create-schema-version"].mockRejectedValueOnce(new Error("schema conflict"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any })
    ).rejects.toThrow("schema conflict");

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 3. Geocode fails — create-events not called ───────────────────────

  it("should stop when geocode-batch throws", async () => {
    tasks["geocode-batch"].mockRejectedValueOnce(new Error("provider rate limited"));

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any })
    ).rejects.toThrow("provider rate limited");

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 4. Verify concurrency key format ──────────────────────────────────

  it("should produce per-resource concurrency key", () => {
    const concurrency = ingestProcessWorkflow.concurrency as (args: { input: { ingestJobId: string } }) => string;
    const key = concurrency({ input: { ingestJobId: "ij-review-1" } });

    expect(key).toBe("ingest:process:ij-review-1");
  });

  // ── 5. Verify no other tasks are called ───────────────────────────────

  it("should not call detection, analyze, detect-schema, or validate tasks", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(tasks["analyze-duplicates"]).not.toHaveBeenCalled();
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["url-fetch"]).not.toHaveBeenCalled();
    expect(tasks["scraper-execution"]).not.toHaveBeenCalled();
  });

  // ── 6. resumeFrom: "detect-schema" runs all 5 tasks ────────────────

  it('resumeFrom: "detect-schema" runs all 5 tasks', async () => {
    tasks["detect-schema"].mockResolvedValueOnce({});
    tasks["validate-schema"].mockResolvedValueOnce({});

    mockJob.input = { ingestJobId: "123", resumeFrom: "detect-schema" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });

  // ── 7. resumeFrom: "analyze-duplicates" reruns the full pipeline ─────

  it('resumeFrom: "analyze-duplicates" reruns duplicate analysis before downstream tasks', async () => {
    tasks["analyze-duplicates"].mockResolvedValueOnce({});
    tasks["detect-schema"].mockResolvedValueOnce({});
    tasks["validate-schema"].mockResolvedValueOnce({});

    mockJob.input = { ingestJobId: "123", resumeFrom: "analyze-duplicates" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledWith("analyze", {
      input: { ingestJobId: "123", generation: 0 },
    });
    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });

  // ── 8. analyze-duplicates review exit — downstream work is skipped ───

  it('resumeFrom: "analyze-duplicates" stops when duplicate analysis requires review', async () => {
    tasks["analyze-duplicates"].mockResolvedValueOnce({ needsReview: true });

    mockJob.input = { ingestJobId: "123", resumeFrom: "analyze-duplicates" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  it('resumeFrom: "detect-schema" stops when validate-schema returns a final failure', async () => {
    tasks["detect-schema"].mockResolvedValueOnce({});
    tasks["validate-schema"].mockResolvedValueOnce({ failed: true, failureReason: "Schema mismatch in strict mode" });

    mockJob.input = { ingestJobId: "123", resumeFrom: "detect-schema" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 9. resumeFrom: "create-events" skips to last task only ──────────

  it('resumeFrom: "create-events" skips to last task only', async () => {
    mockJob.input = { ingestJobId: "123", resumeFrom: "create-events" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: currentJobReq() as any });

    expect(tasks["create-events"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
  });

  // ── 10. Generations ─────────────────────────────────────────────────

  it.each([
    ["an older generation", { generation: 1 }, { id: 1, generation: 2, stage: "needs-review" }],
    ["a completed job", { generation: 2 }, { id: 1, generation: 2, stage: "completed" }],
    ["a legacy child after a newer dispatch", {}, { id: 1, generation: 1, stage: "analyze-duplicates" }],
  ])("returns before its first task for %s", async (_label, input, current) => {
    mockJob.input = { ingestJobId: "1", resumeFrom: "analyze-duplicates", ...input };
    const req = { payload: { findByID: vi.fn().mockResolvedValue(current) } };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: req as any });

    expect(tasks["analyze-duplicates"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
    expect(reconcileAfterJobTransition).not.toHaveBeenCalled();
  });

  it("runs a current generation even though an approved review still shows needs-review", async () => {
    mockJob.input = { ingestJobId: "1", resumeFrom: "create-events", generation: 3 };
    const req = { payload: { findByID: vi.fn().mockResolvedValue({ id: 1, generation: 3, stage: "needs-review" }) } };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: req as any });

    // The task carries its generation so a later bump can tell it apart.
    expect(tasks["create-events"]).toHaveBeenCalledExactlyOnceWith("create-events", {
      input: { ingestJobId: "1", generation: 3 },
    });
    expect(reconcileAfterJobTransition).toHaveBeenCalledExactlyOnceWith(req.payload, "1");
  });

  it("reconciles the run even when a task throws", async () => {
    tasks["create-events"].mockRejectedValueOnce(new Error("database gone"));
    mockJob.input = { ingestJobId: "1", resumeFrom: "create-events" };
    const req = currentJobReq();

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: req as any })
    ).rejects.toThrow("database gone");

    expect(reconcileAfterJobTransition).toHaveBeenCalledExactlyOnceWith(req.payload, "1");
  });
});

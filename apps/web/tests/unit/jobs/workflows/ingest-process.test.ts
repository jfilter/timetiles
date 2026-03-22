/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestProcessWorkflow } from "@/lib/jobs/workflows/ingest-process";

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({
  updateIngestFileStatusForJob: vi.fn().mockResolvedValue(undefined),
}));

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = ingestProcessWorkflow.handler as WorkflowHandler<"ingest-process">;

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "create-schema-version": vi.fn().mockResolvedValue({ success: true, schemaVersionId: 10, versionNumber: 3 }),
  "geocode-batch": vi.fn().mockResolvedValue({ success: true, geocoded: 50, failed: 0 }),
  "create-events": vi.fn().mockResolvedValue({ success: true, eventCount: 50 }),
  "dataset-detection": vi.fn(),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "url-fetch": vi.fn(),
  "scraper-execution": vi.fn(),
});

describe.sequential("ingestProcessWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-process-1", input: { ingestJobId: "ij-review-1" } };
  });

  // ── 1. Happy path — all 3 tasks succeed ───────────────────────────────

  it("should run create-schema-version, geocode, create-events in order", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    // create-schema-version called first
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledWith("create-version", {
      input: { ingestJobId: "ij-review-1" },
    });

    // geocode-batch called second
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledWith("geocode", {
      input: { ingestJobId: "ij-review-1", batchNumber: 0 },
    });

    // create-events called third
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events", { input: { ingestJobId: "ij-review-1" } });
  });

  // ── 2. Create-schema-version fails — geocode and create-events not called

  it("should stop when create-schema-version throws", async () => {
    tasks["create-schema-version"].mockRejectedValueOnce(new Error("schema conflict"));
    const mockReq = { payload: { findByID: vi.fn(), find: vi.fn().mockResolvedValue({ docs: [] }), update: vi.fn() } };

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: mockReq as any })
    ).rejects.toThrow("schema conflict");

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 3. Geocode fails — create-events not called ───────────────────────

  it("should stop when geocode-batch throws", async () => {
    tasks["geocode-batch"].mockRejectedValueOnce(new Error("provider rate limited"));
    const mockReq = { payload: { findByID: vi.fn(), find: vi.fn().mockResolvedValue({ docs: [] }), update: vi.fn() } };

    await expect(
      handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: mockReq as any })
    ).rejects.toThrow("provider rate limited");

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 4. Verify concurrency key format ──────────────────────────────────

  it("should produce concurrency key ingest:${ingestJobId}", () => {
    const concurrency = ingestProcessWorkflow.concurrency as (args: { input: Record<string, any> }) => string;
    const key = concurrency({ input: { ingestJobId: "ij-42" } });

    expect(key).toBe("ingest:ij-42");
  });

  // ── 5. Verify no other tasks are called ───────────────────────────────

  it("should not call detection, analyze, detect-schema, or validate tasks", async () => {
    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(tasks["analyze-duplicates"]).not.toHaveBeenCalled();
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["url-fetch"]).not.toHaveBeenCalled();
    expect(tasks["scraper-execution"]).not.toHaveBeenCalled();
  });

  // ── 6. resumeFrom: "detect-schema" runs all 5 tasks ────────────────

  it('resumeFrom: "detect-schema" runs all 5 tasks', async () => {
    tasks["detect-schema"].mockResolvedValueOnce({ success: true });
    tasks["validate-schema"].mockResolvedValueOnce({ success: true });

    mockJob.input = { ingestJobId: "123", resumeFrom: "detect-schema" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });

  // ── 7. resumeFrom: "create-events" skips to last task only ──────────

  it('resumeFrom: "create-events" skips to last task only', async () => {
    mockJob.input = { ingestJobId: "123", resumeFrom: "create-events" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["create-events"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
  });
});

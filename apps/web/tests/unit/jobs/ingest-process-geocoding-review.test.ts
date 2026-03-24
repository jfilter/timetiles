/**
 * Unit tests for ingest-process workflow geocoding review bypass fix.
 *
 * Verifies that when geocode-batch returns `needsReview: true`,
 * the workflow pauses and does NOT call create-events. When
 * `needsReview` is false or absent, create-events proceeds normally.
 *
 * @module
 * @category Tests
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ingestProcessWorkflow } from "@/lib/jobs/workflows/ingest-process";

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({
  updateIngestFileStatusForJob: vi.fn().mockResolvedValue(undefined),
}));

// Extract handler with correct type
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

describe.sequential("ingest-process: geocoding review bypass", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockJob = { id: "wf-geo-review-1", input: { ingestJobId: "ij-geo-1" } };
  });

  it("should NOT call create-events when geocode-batch returns needsReview: true", async () => {
    tasks["geocode-batch"].mockResolvedValueOnce({ needsReview: true, geocoded: 10, failed: 5 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    // Key assertion: create-events must NOT be called when review is needed
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  it("should call create-events when geocode-batch returns needsReview: false", async () => {
    tasks["geocode-batch"].mockResolvedValueOnce({ needsReview: false, geocoded: 50, failed: 0 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });

  it("should call create-events when geocode-batch returns no needsReview field", async () => {
    tasks["geocode-batch"].mockResolvedValueOnce({ geocoded: 50, failed: 0 });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });

  it("should NOT call create-events when validate-schema returns needsReview on detect-schema resume", async () => {
    mockJob.input = { ingestJobId: "ij-geo-2", resumeFrom: "detect-schema" };
    tasks["detect-schema"].mockResolvedValueOnce({});
    tasks["validate-schema"].mockResolvedValueOnce({ needsReview: true });

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    // Workflow should pause — nothing after validate-schema runs
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  it("should skip geocode and schema-version when resumeFrom is create-events", async () => {
    mockJob.input = { ingestJobId: "ij-geo-3", resumeFrom: "create-events" };

    await handler({ job: mockJob, tasks: tasks as any, inlineTask: vi.fn() as any, req: {} as any });

    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).toHaveBeenCalledOnce();
  });
});

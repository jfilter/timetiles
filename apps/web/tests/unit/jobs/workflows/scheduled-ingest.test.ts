/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scheduledIngestWorkflow } from "@/lib/jobs/workflows/scheduled-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = scheduledIngestWorkflow.handler as WorkflowHandler<"scheduled-ingest">;
type ScheduledIngestWorkflowContext = Parameters<typeof handler>[0];

vi.mock("@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils", () => ({
  loadScheduledIngestForLifecycle: vi.fn().mockResolvedValue({ id: 42, statistics: {}, executionHistory: [] }),
  updateScheduledIngestFailure: vi.fn().mockResolvedValue(undefined),
  updateScheduledIngestSuccess: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadScheduledIngestForLifecycle,
  updateScheduledIngestFailure,
  updateScheduledIngestSuccess,
} from "@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils";

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "url-fetch": vi.fn().mockResolvedValue({ ingestFileId: 77 }),
  "dataset-detection": vi
    .fn()
    .mockResolvedValue({
      sheetsDetected: 1,
      ingestJobsCreated: 1,
      sheets: [{ index: 0, ingestJobId: 9, name: "Sheet1", rowCount: 200 }],
    }),
  "dispatch-ingest-run": vi.fn().mockResolvedValue({ runId: 3, dispatched: true }),
  "analyze-duplicates": vi.fn(),
  "detect-schema": vi.fn(),
  "validate-schema": vi.fn(),
  "create-schema-version": vi.fn(),
  "geocode-batch": vi.fn(),
  "create-events": vi.fn(),
  "scraper-execution": vi.fn(),
});

const createWorkflowArgs = (
  job: ScheduledIngestWorkflowContext["job"],
  tasks: ReturnType<typeof createMockTasks>,
  req: ScheduledIngestWorkflowContext["req"]
): ScheduledIngestWorkflowContext => ({
  job,
  tasks: tasks as unknown as ScheduledIngestWorkflowContext["tasks"],
  inlineTask: vi.fn() as ScheduledIngestWorkflowContext["inlineTask"],
  req,
});

describe("scheduledIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockReq = { payload: {} };
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

  // ── 1. Happy path — fetch, detection, run dispatched ────────────────

  it("should run fetch and detection, then dispatch the run without accounting it", async () => {
    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

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
        deferLifecycleUpdates: true,
      },
    });

    // dataset-detection called with ingestFileId from fetch
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "77" } });

    expect(tasks["dispatch-ingest-run"]).toHaveBeenCalledExactlyOnceWith("dispatch-sheets", {
      input: { ingestFileId: 77, source: "scheduled", scheduledIngestId: 42, ingestJobIds: [9] },
    });
    // The run is accounted once its sheets settle, not when the source workflow ends.
    expect(updateScheduledIngestSuccess).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  // ── 2. Fetch fails — no detection, no sheets ─────────────────────────

  it("should stop when url-fetch throws", async () => {
    tasks["url-fetch"].mockRejectedValueOnce(new Error("404 not found"));

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow("404 not found");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  // ── 3. Fetch returns no ingestFileId — no detection ───────────────────

  it("should fail when url-fetch returns no ingestFileId", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({});

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow(
      "Scheduled ingest did not create an ingest file."
    );

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  // ── 4. Detection fails — no sheets processed ─────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("unsupported format"));

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow("unsupported format");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  // ── 5. Detection returns empty sheets — no sheets processed ───────────

  it("should fail when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow(
      "Scheduled ingest detected no sheets to process."
    );

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  it("should record a successful run when the source has only a header", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({
      sheetsDetected: 1,
      ingestJobsCreated: 0,
      sheets: [],
      noRecords: true,
    });

    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  // ── 6. Verify concurrency key format ──────────────────────────────────

  it("should produce per-resource concurrency key", () => {
    const concurrency = scheduledIngestWorkflow.concurrency as (args: {
      input: { scheduledIngestId: number };
    }) => string;
    const key = concurrency({ input: { scheduledIngestId: 42 } });

    expect(key).toBe("ingest:scheduled:42");
  });

  // ── 7. Fetch returns numeric ingestFileId — converted to string ───────

  it("should convert numeric ingestFileId to string for detection", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: 12345 });

    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

    // ingestFileId should be stringified via String()
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "12345" } });
  });

  it("should stop after duplicate detection and mark the scheduled ingest successful", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: "existing-file-1", isDuplicate: true });

    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(tasks["dispatch-ingest-run"]).not.toHaveBeenCalled();
    expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  it("should wait between reconciliation attempts instead of retrying inside the same outage", async () => {
    // Back-to-back writes all land in the same millisecond of a database outage;
    // without backoff a successful import would sit at lastStatus="running" until reaped.
    vi.useFakeTimers();
    try {
      vi.mocked(loadScheduledIngestForLifecycle)
        .mockRejectedValueOnce(new Error("terminating connection due to administrator command"))
        .mockRejectedValueOnce(new Error("terminating connection due to administrator command"));

      tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: 77, isDuplicate: true });
      const running = handler(createWorkflowArgs(mockJob, tasks, mockReq));

      // Flush everything that does not need a timer: without a backoff the whole
      // retry loop is already through by this point.
      await vi.advanceTimersByTimeAsync(0);
      expect(updateScheduledIngestSuccess).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2_000);
      await running;

      expect(loadScheduledIngestForLifecycle).toHaveBeenCalledTimes(3);
      expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("should keep retrying the status write past the fourth failure", async () => {
    vi.useFakeTimers();
    try {
      // An outage that outlives four attempts, without queueing a fixed number of
      // rejections: a leftover queued rejection would leak into the next test.
      let attempts = 0;
      vi.mocked(loadScheduledIngestForLifecycle).mockImplementation(() => {
        attempts++;
        return attempts <= 4
          ? Promise.reject(new Error("terminating connection due to administrator command"))
          : Promise.resolve({ id: 42, statistics: {}, executionHistory: [] } as never);
      });

      tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: 77, isDuplicate: true });
      const running = handler(createWorkflowArgs(mockJob, tasks, mockReq));
      await vi.advanceTimersByTimeAsync(60_000);
      await running;

      expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      vi.mocked(loadScheduledIngestForLifecycle).mockReset();
      vi.mocked(loadScheduledIngestForLifecycle).mockResolvedValue({
        id: 42,
        statistics: {},
        executionHistory: [],
      } as never);
    }
  });
});

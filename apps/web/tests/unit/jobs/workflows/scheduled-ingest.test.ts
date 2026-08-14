/**
 * @module
 */
import type { WorkflowHandler } from "payload";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { scheduledIngestWorkflow } from "@/lib/jobs/workflows/scheduled-ingest";

// Extract handler with correct type (WorkflowConfig.handler is a union with string)
const handler = scheduledIngestWorkflow.handler as WorkflowHandler<"scheduled-ingest">;
type ScheduledIngestWorkflowContext = Parameters<typeof handler>[0];

// Mock processSheets so we can verify it's called without running the real pipeline
vi.mock("@/lib/jobs/workflows/process-sheets", () => ({ processSheets: vi.fn().mockResolvedValue(undefined) }));

// Mock completion helpers (tested separately)
vi.mock("@/lib/jobs/workflows/completion", () => ({ updateIngestFileStatus: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils", () => ({
  loadScheduledIngestForLifecycle: vi.fn().mockResolvedValue({ id: 42, statistics: {}, executionHistory: [] }),
  updateScheduledIngestFailure: vi.fn().mockResolvedValue(undefined),
  updateScheduledIngestPaused: vi.fn().mockResolvedValue(undefined),
  updateScheduledIngestSuccess: vi.fn().mockResolvedValue(undefined),
}));

import {
  loadScheduledIngestForLifecycle,
  updateScheduledIngestFailure,
  updateScheduledIngestPaused,
  updateScheduledIngestSuccess,
} from "@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils";
import { updateIngestFileStatus } from "@/lib/jobs/workflows/completion";
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

describe.sequential("scheduledIngestWorkflow", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockJob: any;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockReq = {
      payload: {
        findByID: vi.fn().mockResolvedValue({ id: "fetched-file-1", status: "completed" }),
        find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }] }),
      },
    };
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
    expect(updateIngestFileStatus).toHaveBeenCalledOnce();
    expect(loadScheduledIngestForLifecycle).toHaveBeenCalledWith(mockReq.payload, 42);
    expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();

    const processSheetsCallOrder = vi.mocked(processSheets).mock.invocationCallOrder[0];
    const updateIngestFileStatusCallOrder = vi.mocked(updateIngestFileStatus).mock.invocationCallOrder[0];
    const updateScheduledIngestSuccessCallOrder = vi.mocked(updateScheduledIngestSuccess).mock.invocationCallOrder[0];

    expect(processSheetsCallOrder).toBeDefined();
    expect(updateIngestFileStatusCallOrder).toBeDefined();
    expect(updateScheduledIngestSuccessCallOrder).toBeDefined();
    expect(processSheetsCallOrder!).toBeLessThan(updateIngestFileStatusCallOrder!);
    expect(updateIngestFileStatusCallOrder!).toBeLessThan(updateScheduledIngestSuccessCallOrder!);
  });

  // ── 2. Fetch fails — no detection, no sheets ─────────────────────────

  it("should stop when url-fetch throws", async () => {
    tasks["url-fetch"].mockRejectedValueOnce(new Error("404 not found"));

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow("404 not found");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).toHaveBeenCalledOnce();
  });

  // ── 3. Fetch returns no ingestFileId — no detection ───────────────────

  it("should fail when url-fetch returns no ingestFileId", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({});

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow(
      "Scheduled ingest did not create an ingest file."
    );

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).toHaveBeenCalledOnce();
  });

  // ── 4. Detection fails — no sheets processed ─────────────────────────

  it("should stop when detection throws", async () => {
    tasks["dataset-detection"].mockRejectedValueOnce(new Error("unsupported format"));

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow("unsupported format");

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).toHaveBeenCalledOnce();
  });

  // ── 5. Detection returns empty sheets — no sheets processed ───────────

  it("should fail when detection returns empty sheets array", async () => {
    tasks["dataset-detection"].mockResolvedValueOnce({ sheetsDetected: 0, sheets: [] });

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow(
      "Scheduled ingest detected no sheets to process."
    );

    expect(tasks["url-fetch"]).toHaveBeenCalledOnce();
    expect(tasks["dataset-detection"]).toHaveBeenCalledOnce();
    expect(processSheets).not.toHaveBeenCalled();
    expect(updateScheduledIngestFailure).toHaveBeenCalledOnce();
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

    mockReq.payload.findByID.mockResolvedValueOnce({ id: 12345, status: "completed" });
    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

    // ingestFileId should be stringified via String()
    expect(tasks["dataset-detection"]).toHaveBeenCalledWith("detect-sheets", { input: { ingestFileId: "12345" } });
  });

  it("should stop after duplicate detection and mark the scheduled ingest successful", async () => {
    tasks["url-fetch"].mockResolvedValueOnce({ ingestFileId: "existing-file-1", isDuplicate: true });

    await handler(createWorkflowArgs(mockJob, tasks, mockReq));

    expect(tasks["dataset-detection"]).not.toHaveBeenCalled();
    expect(processSheets).not.toHaveBeenCalled();
    expect(updateScheduledIngestSuccess).toHaveBeenCalledOnce();
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
  });

  it("should resolve a review-paused run without counting it as a failure", async () => {
    // A review pause is not a failure: the fetch and downstream jobs worked, a human simply
    // has to approve something. Failing it incremented `currentRetries`, and because a
    // paused run never reached updateScheduledIngestSuccess (which resets the counter), a
    // feed that legitimately needs review each day auto-disabled itself after maxRetries
    // runs — even though the owner approved every single one. The pending review is
    // surfaced through the ingest job's NEEDS_REVIEW stage instead.
    mockReq.payload.findByID.mockResolvedValueOnce({ id: "fetched-file-1", status: "processing" });
    mockReq.payload.find.mockResolvedValueOnce({ docs: [{ stage: "needs-review", reviewReason: "schema-drift" }] });

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).resolves.toBeUndefined();

    // Its own lifecycle state — not "failed" (which increments currentRetries and eventually
    // auto-disables the schedule) and not "success" (which would inflate successfulRuns and
    // claim an import that has not finished).
    expect(updateScheduledIngestFailure).not.toHaveBeenCalled();
    expect(updateScheduledIngestSuccess).not.toHaveBeenCalled();
    expect(updateScheduledIngestPaused).toHaveBeenCalledOnce();
  });

  it("should wait between reconciliation attempts instead of retrying inside the same outage", async () => {
    // Three back-to-back writes all land in the same millisecond of a database
    // outage, so the retry loop only survived errors that were not going to
    // repeat anyway. A successful import then sat at lastStatus="running" until
    // the reaper booked it as failed hours later.
    vi.useFakeTimers();
    try {
      vi.mocked(loadScheduledIngestForLifecycle)
        .mockRejectedValueOnce(new Error("terminating connection due to administrator command"))
        .mockRejectedValueOnce(new Error("terminating connection due to administrator command"));

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

  it("should still fail the run when a downstream job actually failed", async () => {
    mockReq.payload.findByID.mockResolvedValueOnce({ id: "fetched-file-1", status: "processing" });
    mockReq.payload.find.mockResolvedValueOnce({
      docs: [{ stage: "failed", errorLog: { lastError: "geocoding provider unreachable" } }],
    });

    await expect(handler(createWorkflowArgs(mockJob, tasks, mockReq))).rejects.toThrow(
      "geocoding provider unreachable"
    );

    expect(updateScheduledIngestFailure).toHaveBeenCalledOnce();
    expect(updateScheduledIngestSuccess).not.toHaveBeenCalled();
  });
});

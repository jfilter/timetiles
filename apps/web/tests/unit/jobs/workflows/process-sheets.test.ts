/**
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SheetInfo } from "@/lib/jobs/types/task-outputs";
import { processSheets } from "@/lib/jobs/workflows/process-sheets";

// Mock review-checks to avoid real DB calls
vi.mock("@/lib/jobs/workflows/review-checks", () => ({
  REVIEW_REASONS: {
    SCHEMA_DRIFT: "schema-drift",
    QUOTA_EXCEEDED: "quota-exceeded",
    HIGH_DUPLICATE_RATE: "high-duplicates",
    GEOCODING_PARTIAL: "geocoding-partial",
  },
  shouldReviewHighDuplicates: vi.fn().mockReturnValue({ needsReview: false }),
  checkQuotaForSheet: vi.fn().mockResolvedValue({ allowed: true }),
  shouldReviewGeocodingPartial: vi.fn().mockReturnValue({ needsReview: false }),
  setNeedsReview: vi.fn().mockResolvedValue(undefined),
}));

/** Creates a mock tasks object with all task handlers as vi.fn(). */
const createMockTasks = () => ({
  "analyze-duplicates": vi.fn().mockResolvedValue({ success: true, totalRows: 100, uniqueRows: 100 }),
  "detect-schema": vi.fn().mockResolvedValue({ success: true }),
  "validate-schema": vi.fn().mockResolvedValue({ success: true }),
  "create-schema-version": vi.fn().mockResolvedValue({ success: true }),
  "geocode-batch": vi.fn().mockResolvedValue({ success: true, geocoded: 10, failed: 0 }),
  "create-events": vi.fn().mockResolvedValue({ success: true }),
});

/** Creates a minimal mock PayloadRequest. */
const createMockReq = () => ({ payload: {} }) as any;

/** Helper to build a SheetInfo fixture. */
const makeSheet = (index: number, ingestJobId: number | string = `job-${index}`): SheetInfo => ({
  index,
  ingestJobId,
  name: `Sheet${index}`,
  rowCount: 100,
});

describe.sequential("processSheets", () => {
  let tasks: ReturnType<typeof createMockTasks>;
  let mockReq: any;

  beforeEach(() => {
    vi.clearAllMocks();
    tasks = createMockTasks();
    mockReq = createMockReq();
  });

  // ── 1. Single sheet — all 6 tasks called in order ──────────────────────

  it("should call all 6 tasks in order for a single sheet", async () => {
    const sheets: SheetInfo[] = [makeSheet(0, "job-0")];

    await processSheets(tasks as any, sheets, mockReq);

    // Verify each task was called once with expected taskId and input
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledWith("analyze-0", { input: { ingestJobId: "job-0" } });

    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).toHaveBeenCalledWith("detect-schema-0", { input: { ingestJobId: "job-0" } });

    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledWith("validate-0", { input: { ingestJobId: "job-0" } });

    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledWith("create-version-0", {
      input: { ingestJobId: "job-0" },
    });

    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledWith("geocode-0", {
      input: { ingestJobId: "job-0", batchNumber: 0 },
    });

    expect(tasks["create-events"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events-0", { input: { ingestJobId: "job-0" } });
  });

  // ── 2. Multiple sheets — unique IDs per sheet ─────────────────────────

  it("should call tasks with unique IDs per sheet for 3 sheets", async () => {
    const sheets: SheetInfo[] = [makeSheet(0, "j0"), makeSheet(1, "j1"), makeSheet(2, "j2")];

    await processSheets(tasks as any, sheets, mockReq);

    // Each task called 3 times total (once per sheet)
    for (const taskName of [
      "analyze-duplicates",
      "detect-schema",
      "validate-schema",
      "create-schema-version",
      "geocode-batch",
      "create-events",
    ] as const) {
      expect(tasks[taskName]).toHaveBeenCalledTimes(3);
    }

    // Verify IDs contain sheet index
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledWith("analyze-0", expect.any(Object));
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledWith("analyze-1", expect.any(Object));
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledWith("analyze-2", expect.any(Object));

    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events-0", { input: { ingestJobId: "j0" } });
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events-1", { input: { ingestJobId: "j1" } });
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events-2", { input: { ingestJobId: "j2" } });
  });

  // ── 3. Empty sheets array — no tasks called ───────────────────────────

  it("should not call any tasks when sheets array is empty", async () => {
    await processSheets(tasks as any, [], mockReq);

    for (const taskName of [
      "analyze-duplicates",
      "detect-schema",
      "validate-schema",
      "create-schema-version",
      "geocode-batch",
      "create-events",
    ] as const) {
      expect(tasks[taskName]).not.toHaveBeenCalled();
    }
  });

  // ── 4. Analyze fails — remaining tasks for that sheet skipped ─────────

  it("should skip remaining tasks when analyze-duplicates throws", async () => {
    tasks["analyze-duplicates"]
      .mockRejectedValueOnce(new Error("analyze failed")) // sheet 0 throws
      .mockResolvedValueOnce({ totalRows: 10, uniqueRows: 10 }); // sheet 1 succeeds

    const sheets: SheetInfo[] = [makeSheet(0, "j0"), makeSheet(1, "j1")];
    await processSheets(tasks as any, sheets, mockReq);

    // Sheet 0: only analyze called (threw), rest skipped via Promise.allSettled
    // Sheet 1: all tasks called
    expect(tasks["analyze-duplicates"]).toHaveBeenCalledTimes(2);
    expect(tasks["detect-schema"]).toHaveBeenCalledTimes(1);
    expect(tasks["detect-schema"]).toHaveBeenCalledWith("detect-schema-1", { input: { ingestJobId: "j1" } });
    expect(tasks["create-events"]).toHaveBeenCalledTimes(1);
    expect(tasks["create-events"]).toHaveBeenCalledWith("create-events-1", { input: { ingestJobId: "j1" } });
  });

  // ── 5. Detect-schema fails — same skip behavior ──────────────────────

  it("should skip remaining tasks when detect-schema throws", async () => {
    tasks["detect-schema"].mockRejectedValueOnce(new Error("bad format"));

    const sheets: SheetInfo[] = [makeSheet(0, "j0")];
    await processSheets(tasks as any, sheets, mockReq);

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).not.toHaveBeenCalled();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 6. Validate-schema fails (needs-review) — remaining skipped ───────

  it("should skip remaining tasks when validate-schema returns needsReview", async () => {
    tasks["validate-schema"].mockResolvedValueOnce({ needsReview: true, requiresApproval: true });

    const sheets: SheetInfo[] = [makeSheet(0, "j0")];
    await processSheets(tasks as any, sheets, mockReq);

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).not.toHaveBeenCalled();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 7. Create-schema-version fails — remaining skipped ────────────────

  it("should skip geocode and create-events when create-schema-version fails", async () => {
    tasks["create-schema-version"].mockRejectedValueOnce(new Error("version conflict"));

    const sheets: SheetInfo[] = [makeSheet(0, "j0")];
    await processSheets(tasks as any, sheets, mockReq);

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 8. Geocode-batch fails — create-events not called ─────────────────

  it("should not call create-events when geocode-batch fails", async () => {
    tasks["geocode-batch"].mockRejectedValueOnce(new Error("provider unavailable"));

    const sheets: SheetInfo[] = [makeSheet(0, "j0")];
    await processSheets(tasks as any, sheets, mockReq);

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledOnce();
    expect(tasks["detect-schema"]).toHaveBeenCalledOnce();
    expect(tasks["validate-schema"]).toHaveBeenCalledOnce();
    expect(tasks["create-schema-version"]).toHaveBeenCalledOnce();
    expect(tasks["geocode-batch"]).toHaveBeenCalledOnce();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 9. All sheets fail — no events created ────────────────────────────

  it("should not create events when all sheets fail", async () => {
    tasks["analyze-duplicates"]
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));

    const sheets: SheetInfo[] = [makeSheet(0), makeSheet(1), makeSheet(2)];
    await processSheets(tasks as any, sheets, mockReq);

    expect(tasks["analyze-duplicates"]).toHaveBeenCalledTimes(3);
    expect(tasks["detect-schema"]).not.toHaveBeenCalled();
    expect(tasks["create-events"]).not.toHaveBeenCalled();
  });

  // ── 10. Multiple sheets process concurrently via Promise.all ──────────

  it("should process multiple sheets concurrently via Promise.all", async () => {
    const callOrder: string[] = [];

    // Sheet 0's analyze takes longer than sheet 1's entire pipeline
    tasks["analyze-duplicates"]
      .mockImplementationOnce(async (id: string) => {
        // Simulate a delay for sheet 0
        await new Promise((resolve) => setTimeout(resolve, 50));
        callOrder.push(`analyze-${id}`);
        return { success: true };
      })
      .mockImplementationOnce((id: string) => {
        callOrder.push(`analyze-${id}`);
        return { success: true };
      });

    tasks["detect-schema"].mockImplementation((id: string) => {
      callOrder.push(`detect-${id}`);
      return { success: true };
    });

    tasks["validate-schema"].mockImplementation((id: string) => {
      callOrder.push(`validate-${id}`);
      return { success: true };
    });

    tasks["create-schema-version"].mockImplementation((id: string) => {
      callOrder.push(`version-${id}`);
      return { success: true };
    });

    tasks["geocode-batch"].mockImplementation((id: string) => {
      callOrder.push(`geocode-${id}`);
      return { success: true };
    });

    tasks["create-events"].mockImplementation((id: string) => {
      callOrder.push(`events-${id}`);
      return { success: true };
    });

    const sheets: SheetInfo[] = [makeSheet(0, "j0"), makeSheet(1, "j1")];
    await processSheets(tasks as any, sheets, mockReq);

    // Sheet 1 should start processing before sheet 0 finishes analyzing
    // (because Promise.all starts both concurrently)
    const analyzeSheet1Index = callOrder.indexOf("analyze-analyze-1");
    const analyzeSheet0Index = callOrder.indexOf("analyze-analyze-0");

    // Sheet 1's analyze should appear before sheet 0's analyze completes
    // (sheet 0 has a 50ms delay, sheet 1 has none)
    expect(analyzeSheet1Index).toBeLessThan(analyzeSheet0Index);

    // Both sheets should have all tasks called
    expect(tasks["create-events"]).toHaveBeenCalledTimes(2);
  });
});

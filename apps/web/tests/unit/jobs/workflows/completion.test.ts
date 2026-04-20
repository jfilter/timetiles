/**
 * Unit tests for ingest-file workflow completion reconciliation.
 *
 * @module
 */
import { describe, expect, it, vi } from "vitest";

import { updateIngestFileStatus, updateIngestFileStatusForJob } from "@/lib/jobs/workflows/completion";

describe.sequential("workflow completion helpers", () => {
  it("marks ingest files as completed and stores processed counts for terminal jobs", async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValueOnce({ id: "job-1", ingestFile: "file-1" })
        .mockResolvedValueOnce({ id: "job-1", ingestFile: "file-1" }),
      find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }, { stage: "failed" }] }),
      update: vi.fn().mockResolvedValue({}),
    };

    await updateIngestFileStatus(payload as never, [{ index: 0, ingestJobId: "job-1", name: "Sheet 1", rowCount: 2 }]);
    await updateIngestFileStatusForJob(payload as never, "job-1");

    expect(payload.update).toHaveBeenCalledTimes(2);
    for (const call of payload.update.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          collection: "ingest-files",
          id: "file-1",
          data: expect.objectContaining({ status: "failed", datasetsProcessed: 2, completedAt: expect.any(String) }),
        })
      );
    }
  });

  it("keeps ingest files in processing while recording fully-settled review state", async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: "job-1", ingestFile: "file-1" }),
      find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }, { stage: "needs-review" }] }),
      update: vi.fn().mockResolvedValue({}),
    };

    await updateIngestFileStatus(payload as never, [{ index: 0, ingestJobId: "job-1", name: "Sheet 1", rowCount: 2 }]);

    expect(payload.update).toHaveBeenCalledWith({
      collection: "ingest-files",
      id: "file-1",
      data: { status: "processing", datasetsProcessed: 2 },
      context: { skipIngestFileHooks: true },
    });
  });

  it("does not mark the parent ingest file terminal while background work is still running", async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: "job-1", ingestFile: "file-1" }),
      find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }, { stage: "create-events" }] }),
      update: vi.fn().mockResolvedValue({}),
    };

    await updateIngestFileStatus(payload as never, [{ index: 0, ingestJobId: "job-1", name: "Sheet 1", rowCount: 2 }]);

    expect(payload.update).not.toHaveBeenCalled();
  });
});

/**
 * Unit tests for deriving the IngestFile status from its ingest jobs.
 *
 * @module
 */
import { describe, expect, it, vi } from "vitest";

import { updateIngestFileStatusForJob } from "@/lib/ingest/ingest-file-status";

describe("updateIngestFileStatusForJob", () => {
  it("marks ingest files as completed and stores processed counts for terminal jobs", async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: "job-1", ingestFile: "file-1" }),
      find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }, { stage: "failed" }] }),
      update: vi.fn().mockResolvedValue({}),
    };

    await updateIngestFileStatusForJob(payload as never, "job-1");

    expect(payload.update).toHaveBeenCalledTimes(1);
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

    await updateIngestFileStatusForJob(payload as never, "job-1");

    expect(payload.update).toHaveBeenCalledWith({
      collection: "ingest-files",
      id: "file-1",
      data: { status: "processing", datasetsProcessed: 2 },
      context: { skipIngestFileHooks: true },
      req: undefined,
    });
  });

  it("does not mark the parent ingest file terminal while background work is still running", async () => {
    const payload = {
      findByID: vi.fn().mockResolvedValue({ id: "job-1", ingestFile: "file-1" }),
      find: vi.fn().mockResolvedValue({ docs: [{ stage: "completed" }, { stage: "create-events" }] }),
      update: vi.fn().mockResolvedValue({}),
    };

    await updateIngestFileStatusForJob(payload as never, "job-1");

    expect(payload.update).not.toHaveBeenCalled();
  });
});

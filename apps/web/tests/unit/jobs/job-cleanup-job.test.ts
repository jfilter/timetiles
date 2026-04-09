/**
 * Unit tests for Job Cleanup Job Handler.
 *
 * Tests the job-cleanup job which purges old failed and completed
 * Payload jobs to prevent table bloat.
 *
 * @module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logError: vi.fn(),
}));

import { jobCleanupJob } from "@/lib/jobs/handlers/job-cleanup-job";
import { logError } from "@/lib/logger";

describe.sequential("jobCleanupJob", () => {
  let mockPayload: any;

  const createContext = () => ({ job: { id: "cleanup-job-1" }, req: { payload: mockPayload } });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      findByID: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    };
  });

  it("should export correct slug and schedule", () => {
    expect(jobCleanupJob.slug).toBe("job-cleanup");
    expect(jobCleanupJob.schedule).toEqual([{ cron: "0 5 * * *", queue: "maintenance" }]);
    expect(jobCleanupJob.concurrency()).toBe("job-cleanup");
  });

  it("should return zero counts when no old jobs exist", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [] }) // failed jobs query
      .mockResolvedValueOnce({ docs: [] }); // completed jobs query

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(result).toEqual({ output: { success: true, failedDeleted: 0, completedDeleted: 0, errors: 0 } });
  });

  it("should delete old failed jobs", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: "failed-1" }, { id: "failed-2" }, { id: "failed-3" }] })
      .mockResolvedValueOnce({ docs: [] });

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(mockPayload.delete).toHaveBeenCalledTimes(3);
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "payload-jobs",
      id: "failed-1",
      overrideAccess: true,
    });
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "payload-jobs",
      id: "failed-2",
      overrideAccess: true,
    });
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "payload-jobs",
      id: "failed-3",
      overrideAccess: true,
    });
    expect(result.output).toEqual({ success: true, failedDeleted: 3, completedDeleted: 0, errors: 0 });
  });

  it("should delete old completed jobs", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: "completed-1" }, { id: "completed-2" }] });

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(mockPayload.delete).toHaveBeenCalledTimes(2);
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "payload-jobs",
      id: "completed-1",
      overrideAccess: true,
    });
    expect(mockPayload.delete).toHaveBeenCalledWith({
      collection: "payload-jobs",
      id: "completed-2",
      overrideAccess: true,
    });
    expect(result.output).toEqual({ success: true, failedDeleted: 0, completedDeleted: 2, errors: 0 });
  });

  it("should delete both failed and completed jobs in one run", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: "failed-1" }] })
      .mockResolvedValueOnce({ docs: [{ id: "completed-1" }] });

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(mockPayload.delete).toHaveBeenCalledTimes(2);
    expect(result.output).toEqual({ success: true, failedDeleted: 1, completedDeleted: 1, errors: 0 });
  });

  it("should query failed jobs with 7-day retention cutoff", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    mockPayload.find.mockResolvedValue({ docs: [] });

    await jobCleanupJob.handler(createContext() as any);

    const expectedCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: "payload-jobs",
      where: { and: [{ hasError: { equals: true } }, { updatedAt: { less_than: expectedCutoff } }] },
      limit: 500,
      overrideAccess: true,
    });

    vi.spyOn(Date, "now").mockRestore();
  });

  it("should query completed jobs with 3-day retention cutoff", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    mockPayload.find.mockResolvedValue({ docs: [] });

    await jobCleanupJob.handler(createContext() as any);

    const expectedCutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();

    expect(mockPayload.find).toHaveBeenCalledWith({
      collection: "payload-jobs",
      where: { and: [{ completedAt: { exists: true } }, { completedAt: { less_than: expectedCutoff } }] },
      limit: 500,
      overrideAccess: true,
    });

    vi.spyOn(Date, "now").mockRestore();
  });

  it("should increment errors and continue when a failed job delete throws", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: "fail-1" }, { id: "fail-2" }] })
      .mockResolvedValueOnce({ docs: [] });

    mockPayload.delete.mockRejectedValueOnce(new Error("Delete failed")).mockResolvedValueOnce({});

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(result.output).toEqual({ success: true, failedDeleted: 1, completedDeleted: 0, errors: 1 });
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to delete failed job", { payloadJobId: "fail-1" });
  });

  it("should increment errors and continue when a completed job delete throws", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [{ id: "comp-1" }, { id: "comp-2" }] });

    mockPayload.delete.mockRejectedValueOnce(new Error("DB error")).mockResolvedValueOnce({});

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(result.output).toEqual({ success: true, failedDeleted: 0, completedDeleted: 1, errors: 1 });
    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Failed to delete completed job", {
      payloadJobId: "comp-1",
    });
  });

  it("should accumulate errors from both failed and completed job deletions", async () => {
    mockPayload.find
      .mockResolvedValueOnce({ docs: [{ id: "fail-1" }] })
      .mockResolvedValueOnce({ docs: [{ id: "comp-1" }] });

    mockPayload.delete.mockRejectedValueOnce(new Error("Error 1")).mockRejectedValueOnce(new Error("Error 2"));

    const result = await jobCleanupJob.handler(createContext() as any);

    expect(result.output).toEqual({ success: true, failedDeleted: 0, completedDeleted: 0, errors: 2 });
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it("should throw when the initial find query fails", async () => {
    mockPayload.find.mockRejectedValueOnce(new Error("Database unavailable"));

    await expect(jobCleanupJob.handler(createContext() as any)).rejects.toThrow("Database unavailable");

    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Job cleanup failed", { jobId: "cleanup-job-1" });
  });

  it("should throw when the completed jobs find query fails", async () => {
    mockPayload.find.mockResolvedValueOnce({ docs: [] }).mockRejectedValueOnce(new Error("Connection lost"));

    await expect(jobCleanupJob.handler(createContext() as any)).rejects.toThrow("Connection lost");

    expect(logError).toHaveBeenCalledWith(expect.any(Error), "Job cleanup failed", { jobId: "cleanup-job-1" });
  });
});

/**
 * Unit tests for execute account deletion job.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

const { mockGetService } = vi.hoisted(() => ({
  mockGetService: vi.fn(),
}));

vi.mock("@/lib/services/account-deletion-service", () => ({
  getAccountDeletionService: mockGetService,
}));

import { executeAccountDeletionJob } from "@/lib/jobs/handlers/execute-account-deletion-job";

describe("executeAccountDeletionJob", () => {
  it("should have correct slug", () => {
    expect(executeAccountDeletionJob.slug).toBe("execute-account-deletion");
  });

  it("should throw when payload is not available", async () => {
    await expect(executeAccountDeletionJob.handler({ job: { id: "1" }, req: {} })).rejects.toThrow(
      "Payload not available in job context"
    );
  });

  it("should process due deletions successfully", async () => {
    const findDue = vi.fn().mockResolvedValue([
      { id: 1, email: "user1@test.com" },
      { id: 2, email: "user2@test.com" },
    ]);
    const execDel = vi.fn().mockResolvedValue(undefined);
    mockGetService.mockReturnValue({ findDueDeletions: findDue, executeDeletion: execDel } as never);

    const result = await executeAccountDeletionJob.handler({
      job: { id: "job-1" },
      req: { payload: {} as never },
    });

    expect(result.output.success).toBe(true);
    expect(result.output.totalDue).toBe(2);
    expect(result.output.successfulDeletions).toBe(2);
    expect(result.output.failedDeletions).toBe(0);
    expect(execDel).toHaveBeenCalledTimes(2);
    expect(execDel).toHaveBeenCalledWith(1, { deletionType: "scheduled" });
  });

  it("should handle no due deletions", async () => {
    const findDue = vi.fn().mockResolvedValue([]);
    const execDel = vi.fn();
    mockGetService.mockReturnValue({ findDueDeletions: findDue, executeDeletion: execDel } as never);

    const result = await executeAccountDeletionJob.handler({
      job: { id: "job-1" },
      req: { payload: {} as never },
    });

    expect(result.output.totalDue).toBe(0);
    expect(result.output.successfulDeletions).toBe(0);
    expect(execDel).not.toHaveBeenCalled();
  });

  it("should count failed deletions separately", async () => {
    const findDue = vi.fn().mockResolvedValue([
      { id: 1, email: "user1@test.com" },
      { id: 2, email: "user2@test.com" },
    ]);
    const execDel = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Deletion failed"));
    mockGetService.mockReturnValue({ findDueDeletions: findDue, executeDeletion: execDel } as never);

    const result = await executeAccountDeletionJob.handler({
      job: { id: "job-1" },
      req: { payload: {} as never },
    });

    expect(result.output.successfulDeletions).toBe(1);
    expect(result.output.failedDeletions).toBe(1);
  });

  it("should rethrow if findDueDeletions fails", async () => {
    const findDue = vi.fn().mockRejectedValue(new Error("DB error"));
    mockGetService.mockReturnValue({ findDueDeletions: findDue, executeDeletion: vi.fn() } as never);

    await expect(
      executeAccountDeletionJob.handler({
        job: { id: "job-1" },
        req: { payload: {} as never },
      })
    ).rejects.toThrow("DB error");
  });
});

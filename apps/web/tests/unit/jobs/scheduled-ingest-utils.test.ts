// @vitest-environment node
/**
 * Unit tests for scheduled-ingest lifecycle utilities.
 *
 * @module
 */

import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  updateScheduledIngestFailure,
  updateScheduledIngestSuccess,
} from "@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils";

const mocks = vi.hoisted(() => ({ auditLog: vi.fn(), sendRetriesExhaustedEmail: vi.fn() }));

vi.mock("@/lib/ingest/scheduled-ingest-emails", () => ({
  sendScheduledIngestRetriesExhaustedEmail: mocks.sendRetriesExhaustedEmail,
}));

vi.mock("@/lib/services/audit-log-service", () => ({
  AUDIT_ACTIONS: { SCHEDULED_INGEST_RETRIES_EXHAUSTED: "scheduled_ingest.retries_exhausted" },
  auditLog: mocks.auditLog,
}));

describe("scheduled-ingest-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the success status update cannot be persisted", async () => {
    const updateError = new Error("database unavailable");
    const payload = { update: vi.fn().mockRejectedValue(updateError) };

    await expect(
      updateScheduledIngestSuccess(
        payload as never,
        {
          id: "scheduled-1",
          executionHistory: [],
          statistics: { totalRuns: 0, successfulRuns: 0, failedRuns: 0, averageDuration: 0 },
        } as never,
        "ingest-file-1",
        1_000
      )
    ).rejects.toThrow("database unavailable");
  });

  it("notifies the owner only when retry budget is first exhausted", async () => {
    const payload = {
      update: vi.fn().mockResolvedValue({}),
      findByID: vi.fn().mockResolvedValue({ id: 7, email: "owner@example.test" }),
    };

    await updateScheduledIngestFailure(
      payload as never,
      {
        id: "scheduled-1",
        name: "Nightly feed",
        createdBy: 7,
        currentRetries: 3,
        retryConfig: { maxRetries: 3 },
        executionHistory: [],
        statistics: { totalRuns: 3, successfulRuns: 0, failedRuns: 3, averageDuration: 0 },
      } as never,
      new Error("upstream 500")
    );

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scheduled-ingests",
        id: "scheduled-1",
        data: expect.objectContaining({ currentRetries: 4, enabled: false }),
      })
    );
    expect(mocks.auditLog).toHaveBeenCalledOnce();
    expect(mocks.sendRetriesExhaustedEmail).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    payload.update.mockResolvedValue({});
    payload.findByID.mockResolvedValue({ id: 7, email: "owner@example.test" });

    await updateScheduledIngestFailure(
      payload as never,
      {
        id: "scheduled-1",
        name: "Nightly feed",
        createdBy: 7,
        currentRetries: 4,
        retryConfig: { maxRetries: 3 },
        executionHistory: [],
        statistics: { totalRuns: 4, successfulRuns: 0, failedRuns: 4, averageDuration: 0 },
      } as never,
      new Error("upstream still down")
    );

    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "scheduled-ingests",
        id: "scheduled-1",
        data: expect.objectContaining({ currentRetries: 5, enabled: false }),
      })
    );
    expect(mocks.auditLog).not.toHaveBeenCalled();
    expect(mocks.sendRetriesExhaustedEmail).not.toHaveBeenCalled();
  });
});

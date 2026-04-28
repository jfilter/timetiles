// @vitest-environment node
/**
 * Unit tests for scheduled-ingest lifecycle utilities.
 *
 * @module
 */

import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { updateScheduledIngestSuccess } from "@/lib/jobs/handlers/url-fetch-job/scheduled-ingest-utils";

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
});

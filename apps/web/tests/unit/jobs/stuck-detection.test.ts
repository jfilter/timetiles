/**
 * Unit tests for stuck-detection utility functions.
 *
 * Tests `isResourceStuck` (pure logic) and `hasActivePayloadJob`
 * (queries Payload for active jobs as a secondary safety check).
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasActivePayloadJob, isResourceStuck } from "@/lib/jobs/utils/stuck-detection";
import { createMockPayload } from "@/tests/setup/factories";

describe.sequential("stuck-detection utilities", () => {
  describe("isResourceStuck", () => {
    const now = new Date("2026-03-24T12:00:00Z");

    it("should return false when status does not match runningStatus", () => {
      expect(isResourceStuck("completed", "running", "2026-03-24T08:00:00Z", now, 4)).toBe(false);
    });

    it("should return true when status is running and lastRunAt is null", () => {
      expect(isResourceStuck("running", "running", null, now, 4)).toBe(true);
    });

    it("should return true when status is running and lastRunAt is undefined", () => {
      expect(isResourceStuck("running", "running", undefined, now, 4)).toBe(true);
    });

    it("should return true when running longer than the threshold", () => {
      // 5 hours ago — exceeds 4-hour threshold
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
      expect(isResourceStuck("running", "running", fiveHoursAgo, now, 4)).toBe(true);
    });

    it("should return false when running less than the threshold", () => {
      // 3 hours ago — within 4-hour threshold
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
      expect(isResourceStuck("running", "running", threeHoursAgo, now, 4)).toBe(false);
    });

    it("should return true when running exactly at the threshold", () => {
      // Exactly 4 hours ago — at threshold boundary
      const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();
      expect(isResourceStuck("running", "running", fourHoursAgo, now, 4)).toBe(true);
    });

    it("should return true when lastRunAt is an invalid date string", () => {
      expect(isResourceStuck("running", "running", "not-a-date", now, 4)).toBe(true);
    });

    it("should accept Date objects for lastRunAt", () => {
      const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      expect(isResourceStuck("running", "running", threeHoursAgo, now, 4)).toBe(false);
    });

    it("should return false when status is null", () => {
      expect(isResourceStuck(null, "running", "2026-03-24T08:00:00Z", now, 4)).toBe(false);
    });

    it("should return false when status is undefined", () => {
      expect(isResourceStuck(undefined, "running", "2026-03-24T08:00:00Z", now, 4)).toBe(false);
    });
  });

  describe("hasActivePayloadJob", () => {
    let mockPayload: ReturnType<typeof createMockPayload>;

    beforeEach(() => {
      vi.clearAllMocks();
      mockPayload = createMockPayload();
    });

    it("should return true when Payload finds matching active jobs", async () => {
      mockPayload.find.mockResolvedValueOnce({
        docs: [{ id: "job-1", processingStarted: true, hasError: false }],
        totalDocs: 1,
      });

      const result = await hasActivePayloadJob(mockPayload, "input.scheduledIngestId", "si-123");

      expect(result).toBe(true);
      expect(mockPayload.find).toHaveBeenCalledWith({
        collection: "payload-jobs",
        where: {
          and: [
            { "input.scheduledIngestId": { equals: "si-123" } },
            { processingStarted: { equals: true } },
            { hasError: { equals: false } },
            { completedAt: { exists: false } },
          ],
        },
        limit: 1,
        pagination: false,
        overrideAccess: true,
      });
    });

    it("should return false when Payload finds no matching jobs", async () => {
      mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });

      const result = await hasActivePayloadJob(mockPayload, "input.scheduledIngestId", "si-456");

      expect(result).toBe(false);
    });

    it("should return false when Payload throws an error (safe fallback)", async () => {
      mockPayload.find.mockRejectedValueOnce(new Error("Collection not found"));

      const result = await hasActivePayloadJob(mockPayload, "input.scheduledIngestId", "si-789");

      expect(result).toBe(false);
    });

    it("should convert numeric resourceId to string for the query", async () => {
      mockPayload.find.mockResolvedValueOnce({ docs: [], totalDocs: 0 });

      await hasActivePayloadJob(mockPayload, "input.ingestJobId", 42);

      expect(mockPayload.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ and: expect.arrayContaining([{ "input.ingestJobId": { equals: "42" } }]) }),
        })
      );
    });
  });
});

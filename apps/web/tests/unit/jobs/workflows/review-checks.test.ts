/**
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import {
  getResumePointForReason,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewGeocodingPartial,
  shouldReviewHighDuplicates,
} from "@/lib/jobs/workflows/review-checks";

describe.sequential("review-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── REVIEW_REASONS constants ──────────────────────────────────────────

  describe("REVIEW_REASONS", () => {
    it("should have all 4 reason values with correct strings", () => {
      expect(REVIEW_REASONS).toEqual({
        SCHEMA_DRIFT: "schema-drift",
        QUOTA_EXCEEDED: "quota-exceeded",
        HIGH_DUPLICATE_RATE: "high-duplicates",
        GEOCODING_PARTIAL: "geocoding-partial",
      });
    });
  });

  // ── shouldReviewHighDuplicates ────────────────────────────────────────

  describe("shouldReviewHighDuplicates", () => {
    it("should return needsReview false when duplicate rate is exactly 80%", () => {
      // 1000 total, 200 unique → duplicateRate = 1 - 200/1000 = 0.8 (not > 0.8)
      const result = shouldReviewHighDuplicates(1000, 200);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true with duplicateRate 0.9 when rate is 90%", () => {
      // 1000 total, 100 unique → duplicateRate = 1 - 100/1000 = 0.9
      const result = shouldReviewHighDuplicates(1000, 100);
      expect(result).toEqual({ needsReview: true, duplicateRate: 0.9 });
    });

    it("should return needsReview false when rate is 50%", () => {
      // 100 total, 50 unique → duplicateRate = 1 - 50/100 = 0.5
      const result = shouldReviewHighDuplicates(100, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when totalRows is 0", () => {
      const result = shouldReviewHighDuplicates(0, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when uniqueRows is 0", () => {
      const result = shouldReviewHighDuplicates(100, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when all rows are unique", () => {
      // 100 total, 100 unique → duplicateRate = 0
      const result = shouldReviewHighDuplicates(100, 100);
      expect(result).toEqual({ needsReview: false });
    });
  });

  // ── shouldReviewGeocodingPartial ──────────────────────────────────────

  describe("shouldReviewGeocodingPartial", () => {
    it("should return needsReview false when fail rate is exactly 50%", () => {
      // 50 geocoded, 50 failed → failRate = 50/100 = 0.5 (not > 0.5)
      const result = shouldReviewGeocodingPartial(50, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true with failRate 0.7 when 70% failed", () => {
      // 30 geocoded, 70 failed → failRate = 70/100 = 0.7
      const result = shouldReviewGeocodingPartial(30, 70);
      expect(result).toEqual({ needsReview: true, failRate: 0.7 });
    });

    it("should return needsReview false when 30% failed", () => {
      // 70 geocoded, 30 failed → failRate = 30/100 = 0.3
      const result = shouldReviewGeocodingPartial(70, 30);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when 0 geocoded (total failure)", () => {
      // 0 geocoded, 50 failed → geocoded <= 0, treated as total failure
      const result = shouldReviewGeocodingPartial(0, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when 0 failed", () => {
      // 100 geocoded, 0 failed → failRate = 0
      const result = shouldReviewGeocodingPartial(100, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when both are 0", () => {
      const result = shouldReviewGeocodingPartial(0, 0);
      expect(result).toEqual({ needsReview: false });
    });
  });

  // ── getResumePointForReason ───────────────────────────────────────────

  describe("getResumePointForReason", () => {
    it("should return create-schema-version for schema-drift", () => {
      expect(getResumePointForReason("schema-drift")).toBe("create-schema-version");
    });

    it("should return detect-schema for quota-exceeded", () => {
      expect(getResumePointForReason("quota-exceeded")).toBe("detect-schema");
    });

    it("should return detect-schema for high-duplicates", () => {
      expect(getResumePointForReason("high-duplicates")).toBe("detect-schema");
    });

    it("should return create-events for geocoding-partial", () => {
      expect(getResumePointForReason("geocoding-partial")).toBe("create-events");
    });

    it("should return create-schema-version as default for null", () => {
      expect(getResumePointForReason(null)).toBe("create-schema-version");
    });

    it("should return create-schema-version as default for undefined", () => {
      expect(getResumePointForReason(undefined)).toBe("create-schema-version");
    });

    it("should return create-schema-version as default for unknown reason", () => {
      expect(getResumePointForReason("unknown-reason")).toBe("create-schema-version");
    });
  });

  // ── setNeedsReview ─────────────────────────────────────────────────────

  describe("setNeedsReview", () => {
    it("should call payload.update with correct collection, stage, reviewReason, and reviewDetails", async () => {
      const mockPayload = { update: vi.fn().mockResolvedValue({}) };
      const details = { totalRows: 100, uniqueRows: 10, duplicateRate: 0.9 };

      await setNeedsReview(mockPayload as any, "job-123", "high-duplicates", details);

      expect(mockPayload.update).toHaveBeenCalledOnce();
      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: COLLECTION_NAMES.INGEST_JOBS,
        id: "job-123",
        data: { stage: PROCESSING_STAGE.NEEDS_REVIEW, reviewReason: "high-duplicates", reviewDetails: details },
      });
    });
  });
});

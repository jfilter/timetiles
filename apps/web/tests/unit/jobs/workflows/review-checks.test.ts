/**
 * @module
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { getResumePointForReason } from "@/lib/constants/review-reasons";
import {
  parseReviewChecksConfig,
  REVIEW_REASONS,
  setNeedsReview,
  shouldReviewAmbiguousCoordinates,
  shouldReviewAmbiguousDateOrder,
  shouldReviewGeocodingPartial,
  shouldReviewHighDuplicates,
  shouldReviewHighEmptyRows,
  shouldReviewHighRowErrors,
  shouldReviewNoLocation,
  shouldReviewNoTimestamp,
} from "@/lib/jobs/workflows/review-checks";

describe.sequential("review-checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── REVIEW_REASONS constants ──────────────────────────────────────────

  describe("REVIEW_REASONS", () => {
    it("should have all reason values with correct strings", () => {
      expect(REVIEW_REASONS).toEqual({
        SCHEMA_DRIFT: "schema-drift",
        QUOTA_EXCEEDED: "quota-exceeded",
        HIGH_DUPLICATE_RATE: "high-duplicates",
        GEOCODING_PARTIAL: "geocoding-partial",
        HIGH_ROW_ERROR_RATE: "high-row-errors",
        HIGH_EMPTY_ROW_RATE: "high-empty-rows",
        NO_TIMESTAMP_DETECTED: "no-timestamp",
        NO_LOCATION_DETECTED: "no-location",
        AMBIGUOUS_COORDINATE_ORDER: "ambiguous-coordinate-order",
        AMBIGUOUS_DATE_ORDER: "ambiguous-date-order",
        FILE_TOO_LARGE: "file-too-large",
      });
    });
  });

  // ── shouldReviewHighDuplicates ────────────────────────────────────────

  describe("shouldReviewHighDuplicates", () => {
    it("should return needsReview false when duplicate rate is exactly 80%", () => {
      const result = shouldReviewHighDuplicates(1000, 200);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true with duplicateRate 0.9 when rate is 90%", () => {
      const result = shouldReviewHighDuplicates(1000, 100);
      expect(result).toEqual({ needsReview: true, duplicateRate: 0.9 });
    });

    it("should return needsReview false when rate is 50%", () => {
      const result = shouldReviewHighDuplicates(100, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when totalRows is 0", () => {
      const result = shouldReviewHighDuplicates(0, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when uniqueRows is 0 (100% duplicates)", () => {
      const result = shouldReviewHighDuplicates(100, 0);
      expect(result).toEqual({ needsReview: true, duplicateRate: 1 });
    });

    it("should return needsReview false when all rows are unique", () => {
      const result = shouldReviewHighDuplicates(100, 100);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when skipDuplicateRateCheck is true", () => {
      const result = shouldReviewHighDuplicates(1000, 100, { skipDuplicateRateCheck: true });
      expect(result).toEqual({ needsReview: false });
    });

    it("should use custom threshold override", () => {
      // 60% duplicate rate would not trigger default (0.8) but triggers custom (0.5)
      const result = shouldReviewHighDuplicates(100, 40, { duplicateRateThreshold: 0.5 });
      expect(result).toEqual({ needsReview: true, duplicateRate: 0.6 });
    });
  });

  // ── shouldReviewGeocodingPartial ──────────────────────────────────────

  describe("shouldReviewGeocodingPartial", () => {
    it("should return needsReview false when fail rate is exactly 50%", () => {
      const result = shouldReviewGeocodingPartial(50, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true with failRate 0.7 when 70% failed", () => {
      const result = shouldReviewGeocodingPartial(30, 70);
      expect(result).toEqual({ needsReview: true, failRate: 0.7 });
    });

    it("should return needsReview false when 30% failed", () => {
      const result = shouldReviewGeocodingPartial(70, 30);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when 0 geocoded (total failure)", () => {
      const result = shouldReviewGeocodingPartial(0, 50);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when 0 failed", () => {
      const result = shouldReviewGeocodingPartial(100, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when both are 0", () => {
      const result = shouldReviewGeocodingPartial(0, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when skipGeocodingCheck is true", () => {
      const result = shouldReviewGeocodingPartial(30, 70, { skipGeocodingCheck: true });
      expect(result).toEqual({ needsReview: false });
    });

    it("should use custom threshold override", () => {
      // 40% fail rate would not trigger default (0.5) but triggers custom (0.3)
      const result = shouldReviewGeocodingPartial(60, 40, { geocodingFailureThreshold: 0.3 });
      expect(result).toEqual({ needsReview: true, failRate: 0.4 });
    });
  });

  // ── shouldReviewHighRowErrors ─────────────────────────────────────────

  describe("shouldReviewHighRowErrors", () => {
    it("should return needsReview false when error rate is exactly 10%", () => {
      // 90 events + 10 errors = 100 total → 10/100 = 0.1 (not > 0.1)
      const result = shouldReviewHighRowErrors(90, 10);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when error rate is 15%", () => {
      // 85 events + 15 errors = 100 total → 15/100 = 0.15
      const result = shouldReviewHighRowErrors(85, 15);
      expect(result).toEqual({ needsReview: true, errorRate: 0.15 });
    });

    it("should return needsReview false when error rate is 5%", () => {
      const result = shouldReviewHighRowErrors(95, 5);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when both are 0", () => {
      const result = shouldReviewHighRowErrors(0, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when all rows are errors (100%)", () => {
      const result = shouldReviewHighRowErrors(0, 100);
      expect(result).toEqual({ needsReview: true, errorRate: 1 });
    });

    it("should return needsReview false when skipRowErrorCheck is true", () => {
      const result = shouldReviewHighRowErrors(0, 100, { skipRowErrorCheck: true });
      expect(result).toEqual({ needsReview: false });
    });

    it("should use custom threshold override", () => {
      // 5% error rate would not trigger default (0.1) but triggers custom (0.03)
      const result = shouldReviewHighRowErrors(95, 5, { rowErrorThreshold: 0.03 });
      expect(result).toEqual({ needsReview: true, errorRate: 0.05 });
    });
  });

  // ── shouldReviewHighEmptyRows ─────────────────────────────────────────

  describe("shouldReviewHighEmptyRows", () => {
    it("should return needsReview false when empty rate is exactly 20%", () => {
      const result = shouldReviewHighEmptyRows(100, 20);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when empty rate is 30%", () => {
      const result = shouldReviewHighEmptyRows(100, 30);
      expect(result).toEqual({ needsReview: true, emptyRate: 0.3 });
    });

    it("should return needsReview false when empty rate is 10%", () => {
      const result = shouldReviewHighEmptyRows(100, 10);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when totalRows is 0", () => {
      const result = shouldReviewHighEmptyRows(0, 0);
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when all rows are empty", () => {
      const result = shouldReviewHighEmptyRows(100, 100);
      expect(result).toEqual({ needsReview: true, emptyRate: 1 });
    });

    it("should return needsReview false when skipEmptyRowCheck is true", () => {
      const result = shouldReviewHighEmptyRows(100, 100, { skipEmptyRowCheck: true });
      expect(result).toEqual({ needsReview: false });
    });

    it("should use custom threshold override", () => {
      // 15% empty would not trigger default (0.2) but triggers custom (0.1)
      const result = shouldReviewHighEmptyRows(100, 15, { emptyRowThreshold: 0.1 });
      expect(result).toEqual({ needsReview: true, emptyRate: 0.15 });
    });
  });

  // ── shouldReviewNoTimestamp ───────────────────────────────────────────

  describe("shouldReviewNoTimestamp", () => {
    it("should return needsReview true when timestampPath is null", () => {
      const result = shouldReviewNoTimestamp({ timestampPath: null });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview true when timestampPath is undefined", () => {
      const result = shouldReviewNoTimestamp({});
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview true when timestampPath is empty string", () => {
      const result = shouldReviewNoTimestamp({ timestampPath: "" });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview false when timestampPath is a valid string", () => {
      const result = shouldReviewNoTimestamp({ timestampPath: "date" });
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when skipTimestampCheck is true", () => {
      const result = shouldReviewNoTimestamp({ timestampPath: null }, { skipTimestampCheck: true });
      expect(result).toEqual({ needsReview: false });
    });
  });

  // ── shouldReviewNoLocation ────────────────────────────────────────────

  describe("shouldReviewNoLocation", () => {
    it("should return needsReview true when all location paths are null", () => {
      const result = shouldReviewNoLocation({ latitudePath: null, longitudePath: null, locationPath: null });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview false when latitudePath and longitudePath are set", () => {
      const result = shouldReviewNoLocation({ latitudePath: "lat", longitudePath: "lon", locationPath: null });
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when locationPath is set", () => {
      const result = shouldReviewNoLocation({ latitudePath: null, longitudePath: null, locationPath: "address" });
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview true when only latitudePath is set (need both)", () => {
      const result = shouldReviewNoLocation({ latitudePath: "lat", longitudePath: null, locationPath: null });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview true when only longitudePath is set (need both)", () => {
      const result = shouldReviewNoLocation({ latitudePath: null, longitudePath: "lon", locationPath: null });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview true when all paths are undefined", () => {
      const result = shouldReviewNoLocation({});
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview false when skipLocationCheck is true", () => {
      const result = shouldReviewNoLocation({}, { skipLocationCheck: true });
      expect(result).toEqual({ needsReview: false });
    });
  });

  // ── shouldReviewAmbiguousCoordinates ──────────────────────────────────

  describe("shouldReviewAmbiguousCoordinates", () => {
    it("should return needsReview true when a combined column has ambiguous order", () => {
      const result = shouldReviewAmbiguousCoordinates({ coordinatePath: "coords", coordinateFormat: "ambiguous" });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview false when the combined order is explicit", () => {
      expect(shouldReviewAmbiguousCoordinates({ coordinatePath: "coords", coordinateFormat: "lat,lng" })).toEqual({
        needsReview: false,
      });
      expect(shouldReviewAmbiguousCoordinates({ coordinatePath: "coords", coordinateFormat: "lng,lat" })).toEqual({
        needsReview: false,
      });
    });

    it("should return needsReview false when there is no combined column", () => {
      const result = shouldReviewAmbiguousCoordinates({ coordinatePath: null, coordinateFormat: "ambiguous" });
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when skipAmbiguousCoordinateCheck is true", () => {
      const result = shouldReviewAmbiguousCoordinates(
        { coordinatePath: "coords", coordinateFormat: "ambiguous" },
        { skipAmbiguousCoordinateCheck: true }
      );
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false under the best-effort dataset policy", () => {
      const result = shouldReviewAmbiguousCoordinates(
        { coordinatePath: "coords", coordinateFormat: "ambiguous" },
        undefined,
        "best-effort"
      );
      expect(result).toEqual({ needsReview: false });
    });

    it("should still review ambiguous order under the explicit strict policy", () => {
      const result = shouldReviewAmbiguousCoordinates(
        { coordinatePath: "coords", coordinateFormat: "ambiguous" },
        undefined,
        "strict"
      );
      expect(result).toEqual({ needsReview: true });
    });
  });

  // ── shouldReviewAmbiguousDateOrder ────────────────────────────────────

  describe("shouldReviewAmbiguousDateOrder", () => {
    it("should return needsReview true when a timestamp column has ambiguous order", () => {
      const result = shouldReviewAmbiguousDateOrder({ timestampPath: "date", timestampOrder: "ambiguous" });
      expect(result).toEqual({ needsReview: true });
    });

    it("should return needsReview false when the date order is explicit", () => {
      expect(shouldReviewAmbiguousDateOrder({ timestampPath: "date", timestampOrder: "D/M" })).toEqual({
        needsReview: false,
      });
      expect(shouldReviewAmbiguousDateOrder({ timestampPath: "date", timestampOrder: "M/D" })).toEqual({
        needsReview: false,
      });
    });

    it("should return needsReview false when the order is unset (e.g. ISO-only column)", () => {
      expect(shouldReviewAmbiguousDateOrder({ timestampPath: "date", timestampOrder: null })).toEqual({
        needsReview: false,
      });
    });

    it("should return needsReview false when there is no timestamp column", () => {
      const result = shouldReviewAmbiguousDateOrder({ timestampPath: null, timestampOrder: "ambiguous" });
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false when skipAmbiguousDateCheck is true", () => {
      const result = shouldReviewAmbiguousDateOrder(
        { timestampPath: "date", timestampOrder: "ambiguous" },
        { skipAmbiguousDateCheck: true }
      );
      expect(result).toEqual({ needsReview: false });
    });

    it("should return needsReview false under the best-effort dataset policy (opt-in per-row guessing)", () => {
      const result = shouldReviewAmbiguousDateOrder(
        { timestampPath: "date", timestampOrder: "ambiguous" },
        undefined,
        "best-effort"
      );
      expect(result).toEqual({ needsReview: false });
    });

    it("should still review ambiguous order under the explicit strict policy", () => {
      const result = shouldReviewAmbiguousDateOrder(
        { timestampPath: "date", timestampOrder: "ambiguous" },
        undefined,
        "strict"
      );
      expect(result).toEqual({ needsReview: true });
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

    it("should return create-events for high-row-errors", () => {
      expect(getResumePointForReason("high-row-errors")).toBe("create-events");
    });

    it("should return detect-schema for high-empty-rows", () => {
      expect(getResumePointForReason("high-empty-rows")).toBe("detect-schema");
    });

    it("should return detect-schema for no-timestamp", () => {
      expect(getResumePointForReason("no-timestamp")).toBe("detect-schema");
    });

    it("should return detect-schema for no-location", () => {
      expect(getResumePointForReason("no-location")).toBe("detect-schema");
    });

    it("should return detect-schema for ambiguous-coordinate-order", () => {
      expect(getResumePointForReason("ambiguous-coordinate-order")).toBe("detect-schema");
    });

    it("should return detect-schema for ambiguous-date-order", () => {
      expect(getResumePointForReason("ambiguous-date-order")).toBe("detect-schema");
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

  // ── parseReviewChecksConfig ────────────────────────────────────────────

  describe("parseReviewChecksConfig", () => {
    it("returns undefined config without error for null/undefined input", () => {
      expect(parseReviewChecksConfig(null)).toEqual({ config: undefined });
      expect(parseReviewChecksConfig(undefined)).toEqual({ config: undefined });
    });

    it("returns the parsed config for a valid object", () => {
      const raw = { skipDuplicateRateCheck: true, duplicateRateThreshold: 0.5 };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(error).toBeUndefined();
      expect(config).toEqual(raw);
    });

    it("ignores the perSheet namespace when no sheetIndex is given", () => {
      const raw = { skipLocationCheck: true, perSheet: { "0": { skipDuplicateRateCheck: true } } };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(config).toEqual({ skipLocationCheck: true });
      expect(error).toBeUndefined();
    });

    it("merges a sheet's approval flags on top of file-level config", () => {
      const raw = {
        skipLocationCheck: true,
        perSheet: { "0": { skipDuplicateRateCheck: true }, "1": { skipEmptyRowCheck: true } },
      };
      const { config, error } = parseReviewChecksConfig(raw, 0);
      expect(config).toEqual({ skipLocationCheck: true, skipDuplicateRateCheck: true });
      expect(error).toBeUndefined();
    });

    it("does not leak one sheet's approval flag to a sibling sheet", () => {
      const raw = { perSheet: { "0": { skipDuplicateRateCheck: true } } };
      // Sheet 0 approved the duplicate-rate check...
      expect(parseReviewChecksConfig(raw, 0).config).toEqual({ skipDuplicateRateCheck: true });
      // ...sheet 1 must NOT inherit it. An empty config and undefined are
      // equivalent downstream (`?.skip…` is falsy), so assert the flag's absence.
      expect(parseReviewChecksConfig(raw, 1).config?.skipDuplicateRateCheck).toBeUndefined();
    });

    it("rejects unknown keys with an error message", () => {
      const raw = { unknownKey: true };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(config).toBeUndefined();
      expect(error).toContain("Invalid reviewChecks override");
    });

    it("rejects out-of-range thresholds", () => {
      const raw = { duplicateRateThreshold: 2.5 };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(config).toBeUndefined();
      expect(error).toContain("Invalid reviewChecks override");
    });

    it("rejects wrong-typed skip flags", () => {
      const raw = { skipDuplicateRateCheck: "yes" };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(config).toBeUndefined();
      expect(error).toContain("Invalid reviewChecks override");
    });

    it("accepts null values for nullable thresholds", () => {
      const raw = { emptyRowThreshold: null };
      const { config, error } = parseReviewChecksConfig(raw);
      expect(error).toBeUndefined();
      expect(config).toEqual({ emptyRowThreshold: null });
    });
  });
});

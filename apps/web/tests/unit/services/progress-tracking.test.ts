import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProgressTrackingService } from "@/lib/services/progress-tracking";
import type { ImportJob } from "@/payload-types";

describe("ProgressTrackingService", () => {
  let mockPayload: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPayload = {
      update: vi.fn().mockResolvedValue({}),
    };
  });

  describe("getTotalForStage", () => {
    it("should return unique rows for post-deduplication stages", () => {
      const job = {
        progress: { total: 1000 },
        duplicates: {
          summary: { uniqueRows: 800 },
        },
      } as ImportJob;

      // Test post-deduplication stages
      expect(ProgressTrackingService.getTotalForStage(job, "detect-schema")).toBe(800);
      expect(ProgressTrackingService.getTotalForStage(job, "validate-schema")).toBe(800);
      expect(ProgressTrackingService.getTotalForStage(job, "await-approval")).toBe(800);
      expect(ProgressTrackingService.getTotalForStage(job, "geocode-batch")).toBe(800);
      expect(ProgressTrackingService.getTotalForStage(job, "create-events")).toBe(800);
    });

    it("should return original total for pre-deduplication stages", () => {
      const job = {
        progress: { total: 1000 },
        duplicates: {
          summary: { uniqueRows: 800 },
        },
      } as ImportJob;

      expect(ProgressTrackingService.getTotalForStage(job, "analyze-duplicates")).toBe(1000);
    });

    it("should return original total when duplicates summary is not available", () => {
      const job = {
        progress: { total: 1000 },
      } as ImportJob;

      expect(ProgressTrackingService.getTotalForStage(job, "detect-schema")).toBe(1000);
    });

    it("should return 0 when no progress information is available", () => {
      const job = {} as ImportJob;

      expect(ProgressTrackingService.getTotalForStage(job, "detect-schema")).toBe(0);
    });
  });

  describe("createDeduplicationProgress", () => {
    it("should create correct deduplication summary", () => {
      const result = ProgressTrackingService.createDeduplicationProgress(1000, 800, 150, 50);

      expect(result).toEqual({
        totalRows: 1000,
        uniqueRows: 800,
        internalDuplicates: 150,
        externalDuplicates: 50,
      });
    });
  });

  describe("updateJobProgress", () => {
    it("should update job progress with string job ID", async () => {
      const job = {
        progress: { current: 100, batchNumber: 2 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      await ProgressTrackingService.updateJobProgress(mockPayload, "123", "detect-schema", 50, job, {
        customField: "value",
      });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          progress: {
            current: 150, // 100 + 50
            total: 800, // uniqueRows for post-deduplication stage
            batchNumber: 3, // 2 + 1
          },
          customField: "value",
        },
      });
    });

    it("should update job progress with numeric job ID", async () => {
      const job = {
        progress: { current: 200, batchNumber: 5 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      await ProgressTrackingService.updateJobProgress(mockPayload, 456, "geocode-batch", 25, job);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 456,
        data: {
          progress: {
            current: 225, // 200 + 25
            total: 800,
            batchNumber: 6, // 5 + 1
          },
        },
      });
    });

    it("should handle job with no existing progress", async () => {
      const job = {
        duplicates: { summary: { uniqueRows: 1000 } },
      } as ImportJob;

      await ProgressTrackingService.updateJobProgress(mockPayload, 789, "validate-schema", 10, job);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 789,
        data: {
          progress: {
            current: 10, // 0 + 10
            total: 1000,
            batchNumber: 1, // 0 + 1
          },
        },
      });
    });
  });

  describe("updateGeocodingProgress", () => {
    it("should update geocoding progress with string job ID", async () => {
      const job = {
        geocodingProgress: { current: 50 },
        duplicates: { summary: { uniqueRows: 500 } },
      } as ImportJob;

      const geocodingResults = {
        "123 Main St": { lat: 40.7128, lng: -74.006 },
        "456 Oak Ave": { lat: 34.0522, lng: -118.2437 },
      };

      await ProgressTrackingService.updateGeocodingProgress(mockPayload, "123", 25, job, geocodingResults);

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 123,
        data: {
          geocodingResults,
          geocodingProgress: {
            current: 75, // 50 + 25
            total: 500, // uniqueRows for geocode-batch stage
          },
        },
      });
    });

    it("should update geocoding progress with numeric job ID", async () => {
      const job = {
        geocodingProgress: { current: 100 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      await ProgressTrackingService.updateGeocodingProgress(mockPayload, 456, 50, job, {});

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 456,
        data: {
          geocodingResults: {},
          geocodingProgress: {
            current: 150, // 100 + 50
            total: 800,
          },
        },
      });
    });

    it("should handle job with no existing geocoding progress", async () => {
      const job = {
        duplicates: { summary: { uniqueRows: 1000 } },
      } as ImportJob;

      await ProgressTrackingService.updateGeocodingProgress(mockPayload, 789, 30, job, { test: "result" });

      expect(mockPayload.update).toHaveBeenCalledWith({
        collection: "import-jobs",
        id: 789,
        data: {
          geocodingResults: { test: "result" },
          geocodingProgress: {
            current: 30, // 0 + 30
            total: 1000,
          },
        },
      });
    });
  });

  describe("createInitialProgress", () => {
    it("should create initial progress with correct values", () => {
      const result = ProgressTrackingService.createInitialProgress(1500);

      expect(result).toEqual({
        current: 0,
        total: 1500,
        batchNumber: 0,
      });
    });
  });

  describe("isStageComplete", () => {
    it("should return true when geocoding progress is complete", () => {
      const job = {
        geocodingProgress: { current: 100, total: 100 },
      } as ImportJob;

      expect(ProgressTrackingService.isStageComplete(job, "geocode-batch")).toBe(true);
    });

    it("should return false when geocoding progress is incomplete", () => {
      const job = {
        geocodingProgress: { current: 50, total: 100 },
      } as ImportJob;

      expect(ProgressTrackingService.isStageComplete(job, "geocode-batch")).toBe(false);
    });

    it("should return true when regular progress is complete for post-deduplication stage", () => {
      const job = {
        progress: { current: 800, total: 1000 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      expect(ProgressTrackingService.isStageComplete(job, "detect-schema")).toBe(true);
    });

    it("should return false when regular progress is incomplete", () => {
      const job = {
        progress: { current: 500, total: 1000 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      expect(ProgressTrackingService.isStageComplete(job, "detect-schema")).toBe(false);
    });

    it("should return false when no progress information is available", () => {
      const job = {} as ImportJob;

      expect(ProgressTrackingService.isStageComplete(job, "detect-schema")).toBe(false);
    });
  });

  describe("getCompletionPercentage", () => {
    it("should calculate correct percentage for geocoding progress", () => {
      const job = {
        geocodingProgress: { current: 75, total: 100 },
      } as ImportJob;

      expect(ProgressTrackingService.getCompletionPercentage(job, "geocode-batch")).toBe(75);
    });

    it("should return 100% when geocoding total is 0", () => {
      const job = {
        geocodingProgress: { current: 0, total: 0 },
      } as ImportJob;

      expect(ProgressTrackingService.getCompletionPercentage(job, "geocode-batch")).toBe(100);
    });

    it("should calculate correct percentage for regular progress with post-deduplication stage", () => {
      const job = {
        progress: { current: 600, total: 1000 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      // 600 / 800 (uniqueRows) = 75%
      expect(ProgressTrackingService.getCompletionPercentage(job, "detect-schema")).toBe(75);
    });

    it("should calculate correct percentage for regular progress with pre-deduplication stage", () => {
      const job = {
        progress: { current: 400, total: 1000 },
        duplicates: { summary: { uniqueRows: 800 } },
      } as ImportJob;

      // 400 / 1000 (original total) = 40%
      expect(ProgressTrackingService.getCompletionPercentage(job, "analyze-duplicates")).toBe(40);
    });

    it("should return 100% when total is 0", () => {
      const job = {
        progress: { current: 0, total: 0 },
      } as ImportJob;

      expect(ProgressTrackingService.getCompletionPercentage(job, "detect-schema")).toBe(100);
    });

    it("should return 0% when no progress information is available", () => {
      const job = {} as ImportJob;

      expect(ProgressTrackingService.getCompletionPercentage(job, "detect-schema")).toBe(0);
    });

    it("should handle fractional percentages by rounding", () => {
      const job = {
        progress: { current: 333, total: 1000 },
      } as ImportJob;

      // 333 / 1000 = 33.3%, should round to 33%
      expect(ProgressTrackingService.getCompletionPercentage(job, "analyze-duplicates")).toBe(33);
    });
  });
});

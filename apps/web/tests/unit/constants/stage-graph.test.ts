/**
 * Unit tests for the simplified stage-graph constants.
 *
 * Verifies stage ordering, recovery stage definitions, and that
 * removed exports (VALID_TRANSITIONS, STAGE_TO_JOB_TYPE, isValidTransition)
 * are no longer part of the module API after the workflow migration.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import * as stageGraphExports from "@/lib/constants/stage-graph";
import { isRecoveryStage, RECOVERY_STAGES, RECOVERY_STAGES_LIST, STAGE_ORDER } from "@/lib/constants/stage-graph";

describe("stage-graph", () => {
  describe("STAGE_ORDER", () => {
    it("should contain correct stages in correct order with NEEDS_REVIEW", () => {
      expect(STAGE_ORDER).toEqual([
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.NEEDS_REVIEW,
        PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
      ]);
    });

    it("should have exactly 7 stages", () => {
      expect(STAGE_ORDER).toHaveLength(7);
    });
  });

  describe("RECOVERY_STAGES_LIST", () => {
    it("should contain expected recovery stages", () => {
      expect(RECOVERY_STAGES_LIST).toEqual([
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
      ]);
    });
  });

  describe("RECOVERY_STAGES Set", () => {
    it("should contain all recovery stages", () => {
      for (const stage of RECOVERY_STAGES_LIST) {
        expect(RECOVERY_STAGES.has(stage)).toBe(true);
      }
    });

    it("should not contain extra stages beyond the recovery list", () => {
      expect(RECOVERY_STAGES.size).toBe(RECOVERY_STAGES_LIST.length);
    });
  });

  describe("isRecoveryStage()", () => {
    it("should return true for valid recovery stages", () => {
      const validRecoveryStages = [
        PROCESSING_STAGE.ANALYZE_DUPLICATES,
        PROCESSING_STAGE.DETECT_SCHEMA,
        PROCESSING_STAGE.VALIDATE_SCHEMA,
        PROCESSING_STAGE.GEOCODE_BATCH,
        PROCESSING_STAGE.CREATE_EVENTS,
      ];

      for (const stage of validRecoveryStages) {
        expect(isRecoveryStage(stage)).toBe(true);
      }
    });

    it("should return false for non-recovery stages", () => {
      const nonRecoveryStages = [
        PROCESSING_STAGE.NEEDS_REVIEW,
        PROCESSING_STAGE.COMPLETED,
        PROCESSING_STAGE.FAILED,
        PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
      ];

      for (const stage of nonRecoveryStages) {
        expect(isRecoveryStage(stage)).toBe(false);
      }
    });
  });

  describe("removed exports", () => {
    it("should not export VALID_TRANSITIONS, STAGE_TO_JOB_TYPE, or isValidTransition", () => {
      const exportedKeys = Object.keys(stageGraphExports);

      expect(exportedKeys).not.toContain("VALID_TRANSITIONS");
      expect(exportedKeys).not.toContain("STAGE_TO_JOB_TYPE");
      expect(exportedKeys).not.toContain("isValidTransition");
    });
  });
});

/**
 * Unit tests for the simplified stage-graph module.
 * Only STAGE_ORDER remains — used by UI for progress display.
 * @module
 */
import { describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import * as stageGraphExports from "@/lib/constants/stage-graph";
import { STAGE_ORDER } from "@/lib/constants/stage-graph";

describe("Stage Graph (Display Only)", () => {
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

  it("should not export recovery stages or transition validation (removed)", () => {
    const exportKeys = Object.keys(stageGraphExports);
    expect(exportKeys).toEqual(["STAGE_ORDER"]);
    expect(exportKeys).not.toContain("RECOVERY_STAGES");
    expect(exportKeys).not.toContain("isRecoveryStage");
    expect(exportKeys).not.toContain("isValidTransition");
    expect(exportKeys).not.toContain("VALID_TRANSITIONS");
    expect(exportKeys).not.toContain("STAGE_TO_JOB_TYPE");
    expect(exportKeys).not.toContain("getNextRecoveryStage");
  });
});

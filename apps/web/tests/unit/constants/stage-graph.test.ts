/**
 * Unit tests for the simplified stage-graph module.
 * Only STAGE_ORDER remains — used by UI for progress display.
 * @module
 */
import { describe, expect, it } from "vitest";

import { PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
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
});

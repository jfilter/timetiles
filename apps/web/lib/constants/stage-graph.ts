/**
 * Stage ordering for the ingest pipeline.
 *
 * Used by the UI to display progress timelines. Stage transitions and
 * job orchestration are handled by Payload Workflows — this module
 * only defines the display order.
 *
 * @module
 * @category Constants
 */
import type { ProcessingStage } from "./ingest-constants";
import { PROCESSING_STAGE } from "./ingest-constants";

/**
 * Ordered processing stages for UI display (excludes terminal COMPLETED/FAILED).
 */
export const STAGE_ORDER: readonly ProcessingStage[] = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.NEEDS_REVIEW,
  PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
];

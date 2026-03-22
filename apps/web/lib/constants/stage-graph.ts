/**
 * Canonical stage graph for the import pipeline.
 *
 * Defines stage ordering and recovery stages used by UI, hooks, and
 * error recovery. Stage transitions and job-type mapping are handled
 * by Payload Workflows.
 *
 * @module
 * @category Constants
 */
import type { ProcessingStage } from "./ingest-constants";
import { PROCESSING_STAGE } from "./ingest-constants";

/**
 * Ordered processing stages (excludes terminal COMPLETED/FAILED).
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

/**
 * Stages that a FAILED job can recover to (as tuple for Zod enum compatibility).
 * Must be stages that queue a background job (excludes NEEDS_REVIEW).
 */
export const RECOVERY_STAGES_LIST = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
] as const;

/** Set form for O(1) lookups. */
export const RECOVERY_STAGES: ReadonlySet<ProcessingStage> = new Set(RECOVERY_STAGES_LIST);

/**
 * Check if a stage is a valid recovery target from FAILED.
 */
export const isRecoveryStage = (stage: string): boolean => RECOVERY_STAGES.has(stage as ProcessingStage);

/**
 * Get the next recovery stage after a given lastSuccessfulStage.
 *
 * Finds the stage after lastSuccessfulStage in STAGE_ORDER, then clamps
 * to the nearest valid recovery stage if needed.
 *
 * @returns The recovery stage, or ANALYZE_DUPLICATES as default
 */
export const getNextRecoveryStage = (lastSuccessfulStage: string | null | undefined): ProcessingStage => {
  if (!lastSuccessfulStage) {
    return PROCESSING_STAGE.ANALYZE_DUPLICATES;
  }

  const idx = STAGE_ORDER.indexOf(lastSuccessfulStage as ProcessingStage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) {
    return PROCESSING_STAGE.ANALYZE_DUPLICATES;
  }

  // Walk forward from lastSuccessfulStage + 1 to find the first recovery stage
  for (let i = idx + 1; i < STAGE_ORDER.length; i++) {
    if (RECOVERY_STAGES.has(STAGE_ORDER[i]!)) {
      return STAGE_ORDER[i]!;
    }
  }

  return PROCESSING_STAGE.ANALYZE_DUPLICATES;
};

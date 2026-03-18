/**
 * Canonical stage graph for the import pipeline.
 *
 * Single source of truth for stage transitions, recovery stages, and
 * stage-to-job-type mapping. All consumers (StageTransitionService,
 * ErrorRecoveryService, import-jobs hooks) derive from this module.
 *
 * @module
 * @category Constants
 */
import type { JobType, ProcessingStage } from "./import-constants";
import { JOB_TYPES, PROCESSING_STAGE } from "./import-constants";

/**
 * Ordered processing stages (excludes terminal COMPLETED/FAILED).
 */
export const STAGE_ORDER: readonly ProcessingStage[] = [
  PROCESSING_STAGE.ANALYZE_DUPLICATES,
  PROCESSING_STAGE.DETECT_SCHEMA,
  PROCESSING_STAGE.VALIDATE_SCHEMA,
  PROCESSING_STAGE.AWAIT_APPROVAL,
  PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
  PROCESSING_STAGE.GEOCODE_BATCH,
  PROCESSING_STAGE.CREATE_EVENTS,
];

/**
 * Stages that a FAILED job can recover to (as tuple for Zod enum compatibility).
 * Must be stages that queue a background job (excludes AWAIT_APPROVAL).
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
 * Valid stage transitions.
 *
 * The FAILED entry is derived from RECOVERY_STAGES to prevent drift.
 */
export const VALID_TRANSITIONS: Partial<Record<ProcessingStage, readonly ProcessingStage[]>> = {
  [PROCESSING_STAGE.ANALYZE_DUPLICATES]: [PROCESSING_STAGE.DETECT_SCHEMA],
  [PROCESSING_STAGE.DETECT_SCHEMA]: [PROCESSING_STAGE.VALIDATE_SCHEMA],
  [PROCESSING_STAGE.VALIDATE_SCHEMA]: [
    PROCESSING_STAGE.AWAIT_APPROVAL,
    PROCESSING_STAGE.CREATE_SCHEMA_VERSION,
    PROCESSING_STAGE.GEOCODE_BATCH,
  ],
  [PROCESSING_STAGE.AWAIT_APPROVAL]: [PROCESSING_STAGE.CREATE_SCHEMA_VERSION],
  [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: [PROCESSING_STAGE.GEOCODE_BATCH],
  [PROCESSING_STAGE.GEOCODE_BATCH]: [PROCESSING_STAGE.CREATE_EVENTS],
  [PROCESSING_STAGE.CREATE_EVENTS]: [PROCESSING_STAGE.COMPLETED],
  [PROCESSING_STAGE.COMPLETED]: [],
  [PROCESSING_STAGE.FAILED]: [...RECOVERY_STAGES],
};

/**
 * Maps each processing stage to its background job type.
 * Stages with no automatic job (AWAIT_APPROVAL, COMPLETED, FAILED) map to null.
 */
export const STAGE_TO_JOB_TYPE: Partial<Record<ProcessingStage, JobType | null>> = {
  [PROCESSING_STAGE.ANALYZE_DUPLICATES]: JOB_TYPES.ANALYZE_DUPLICATES,
  [PROCESSING_STAGE.DETECT_SCHEMA]: JOB_TYPES.DETECT_SCHEMA,
  [PROCESSING_STAGE.VALIDATE_SCHEMA]: JOB_TYPES.VALIDATE_SCHEMA,
  [PROCESSING_STAGE.AWAIT_APPROVAL]: null,
  [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: JOB_TYPES.CREATE_SCHEMA_VERSION,
  [PROCESSING_STAGE.GEOCODE_BATCH]: JOB_TYPES.GEOCODE_BATCH,
  [PROCESSING_STAGE.CREATE_EVENTS]: JOB_TYPES.CREATE_EVENTS,
  [PROCESSING_STAGE.COMPLETED]: null,
  [PROCESSING_STAGE.FAILED]: null,
};

/**
 * Check if a stage is a valid recovery target from FAILED.
 */
export const isRecoveryStage = (stage: string): boolean => RECOVERY_STAGES.has(stage as ProcessingStage);

/**
 * Check if a stage transition is valid.
 */
export const isValidTransition = (from: string, to: string): boolean => {
  // Any stage can transition to FAILED
  if (to === PROCESSING_STAGE.FAILED) return true;

  // Same-stage updates are allowed
  if (from === to) return true;

  const validTargets = VALID_TRANSITIONS[from as ProcessingStage] ?? [];
  return validTargets.includes(to as ProcessingStage);
};

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

/**
 * Stage time weights and configuration for import progress tracking.
 *
 * This module defines estimated relative time weights for each processing stage,
 * which are used to calculate weighted overall progress across stages. The weights
 * are based on typical import characteristics and can be adjusted to better reflect
 * actual processing times in your environment.
 *
 * @module
 * @category Constants
 */

import { PROCESSING_STAGE } from "./import-constants";

/**
 * Estimated relative time weights for each processing stage.
 *
 * These values are relative (not absolute time) and represent the typical
 * proportion of time each stage takes during an import. The total of all
 * active (non-zero) weights equals TOTAL_ACTIVE_WEIGHT.
 *
 * Stages with weight 0 are excluded from progress calculations:
 * - AWAIT_APPROVAL: Manual user interaction, time unpredictable
 * - COMPLETED/FAILED: Terminal states
 */
export const STAGE_TIME_WEIGHTS = {
  [PROCESSING_STAGE.ANALYZE_DUPLICATES]: 10, // Fast, in-memory comparison
  [PROCESSING_STAGE.DETECT_SCHEMA]: 15, // File I/O, type inference
  [PROCESSING_STAGE.VALIDATE_SCHEMA]: 5, // Comparison only
  [PROCESSING_STAGE.AWAIT_APPROVAL]: 0, // Manual - excluded from calculations
  [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: 5, // Single DB write
  [PROCESSING_STAGE.GEOCODE_BATCH]: 30, // External API calls (slowest)
  [PROCESSING_STAGE.CREATE_EVENTS]: 25, // Bulk DB inserts
  [PROCESSING_STAGE.COMPLETED]: 0,
  [PROCESSING_STAGE.FAILED]: 0,
} as const;

/**
 * Total weight of all active stages (excluding manual and terminal stages).
 *
 * This is the sum of all non-zero weights and is used as the denominator
 * when calculating weighted progress percentages.
 */
export const TOTAL_ACTIVE_WEIGHT = 90; // 10 + 15 + 5 + 5 + 30 + 25

/**
 * User-friendly display names for each processing stage.
 *
 * These names are used in UI components and API responses to provide
 * clear, human-readable stage descriptions.
 */
export const STAGE_DISPLAY_NAMES = {
  [PROCESSING_STAGE.ANALYZE_DUPLICATES]: "Analyzing Duplicates",
  [PROCESSING_STAGE.DETECT_SCHEMA]: "Detecting Schema",
  [PROCESSING_STAGE.VALIDATE_SCHEMA]: "Validating Schema",
  [PROCESSING_STAGE.AWAIT_APPROVAL]: "Awaiting Approval",
  [PROCESSING_STAGE.CREATE_SCHEMA_VERSION]: "Creating Schema Version",
  [PROCESSING_STAGE.GEOCODE_BATCH]: "Geocoding Locations",
  [PROCESSING_STAGE.CREATE_EVENTS]: "Creating Events",
  [PROCESSING_STAGE.COMPLETED]: "Completed",
  [PROCESSING_STAGE.FAILED]: "Failed",
} as const;

/**
 * Type for stage time weights.
 */
export type StageTimeWeights = typeof STAGE_TIME_WEIGHTS;

/**
 * Type for stage display names.
 */
export type StageDisplayNames = typeof STAGE_DISPLAY_NAMES;

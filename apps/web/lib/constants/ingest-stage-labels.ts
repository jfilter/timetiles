/**
 * Shared Ingest translation keys for pipeline stages.
 * @module
 * @category Constants
 */
import type { AppConfig } from "next-intl";

import type { IngestJob } from "@/payload-types";

type StageLabelKey = keyof AppConfig["Messages"]["Ingest"];

export const STAGE_I18N_KEYS: Record<IngestJob["stage"], StageLabelKey> & Partial<Record<string, StageLabelKey>> = {
  "analyze-duplicates": "stageAnalyzingDuplicates",
  "detect-schema": "stageDetectingSchema",
  "validate-schema": "stageValidating",
  "needs-review": "stageAwaitingApproval",
  "create-schema-version": "stageSettingUpDataset",
  "geocode-batch": "stageGeocoding",
  "create-events": "stageCreatingEvents",
  completed: "stageComplete",
  failed: "importFailed",
};

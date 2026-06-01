/**
 * Backfill of detection-resolved interpretation roles/column policies onto the
 * AUTHORED dataset plan (ADR 0040).
 *
 * Extracted from `schema-detection-job-support.ts` to keep that module under the
 * line budget. For auto-detected datasets the authored plan has empty roles, so
 * `event-detail.ts planRolesToFieldPathMappings` (which reads
 * `dataset.interpretationPlan.roles`) would render blank — this fills the gap
 * after detection without clobbering authored intent.
 *
 * @module
 * @category Jobs
 */
import type { Payload } from "payload";

import { COLLECTION_NAMES } from "@/lib/constants/ingest-constants";
import { readInterpretationPlan } from "@/lib/ingest/interpret";
import type {
  ColumnInterpretation,
  DatasetInterpretationPlan,
  InterpretationRoles,
} from "@/lib/ingest/types/interpretation";
import { asSystem } from "@/lib/services/system-payload";
import type { Dataset } from "@/payload-types";

/** The role keys detection can resolve, in {@link InterpretationRoles} order. */
const ROLE_KEYS: readonly (keyof InterpretationRoles)[] = [
  "title",
  "description",
  "locationName",
  "timestamp",
  "endTimestamp",
  "location",
  "coordinate",
  "latitude",
  "longitude",
  "id",
];

/**
 * Conservative role/column merge for the DATASET plan backfill.
 *
 * Authored (user/manifest) intent ALWAYS wins: detection only fills roles the
 * authored plan left empty (a set authored role is never overwritten), and only
 * adds a column policy for a field the authored plan has no entry for (an
 * existing authored column — e.g. a confirmed order or a user-resolved
 * `requiresChoice` — is never touched). `changed` is true only when detection
 * actually contributed something new, so the caller can skip a no-op write.
 */
const mergeAuthoredWithDetection = (
  authored: DatasetInterpretationPlan,
  detection: DatasetInterpretationPlan
): { roles: InterpretationRoles; columns: ColumnInterpretation[]; changed: boolean } => {
  let changed = false;

  // Fill only roles the authored plan left unset (null/undefined); keep authored
  // role values verbatim. Detection's own null roles never overwrite anything.
  const roles: InterpretationRoles = { ...authored.roles };
  for (const key of ROLE_KEYS) {
    if (roles[key] == null && detection.roles[key] != null) {
      roles[key] = detection.roles[key];
      changed = true;
    }
  }

  // Add detection column policies only for fields the authored plan lacks.
  const authoredFields = new Set(authored.columns.map((column) => column.field));
  const newColumns = detection.columns.filter((column) => !authoredFields.has(column.field));
  if (newColumns.length > 0) changed = true;
  const columns = [...authored.columns, ...newColumns];

  return { roles, columns, changed };
};

/**
 * Backfill detection-resolved roles/column policies onto the AUTHORED dataset plan.
 *
 * For auto-detected datasets the authored plan has empty roles, so
 * `event-detail.ts planRolesToFieldPathMappings` (which reads
 * `dataset.interpretationPlan.roles`) would return blank. Merge the detected
 * title/timestamp/location roles + resolved column policies into the dataset
 * plan WITHOUT clobbering authored intent: never overwrite a set authored role,
 * a confirmed authored column policy/order, or a user-resolved `requiresChoice`.
 *
 * CRUCIALLY this never touches `ops` (the dedup-stability surface) nor
 * `ambiguityResolution` (an explicit strict/best-effort choice) — both are
 * preserved verbatim from the authored plan. Skips the write entirely when the
 * merge contributed nothing (no-op), avoiding needless writes and races with
 * parallel sheets.
 */
export const backfillResolvedRolesToDataset = async (
  payload: Payload,
  dataset: Dataset | null,
  jobPlan: DatasetInterpretationPlan
): Promise<void> => {
  if (!dataset) return;

  const authored = readInterpretationPlan(dataset) ?? {
    ops: [],
    columns: [],
    roles: {},
    ambiguityResolution: "strict" as const,
  };

  const { roles, columns, changed } = mergeAuthoredWithDetection(authored, jobPlan);
  if (!changed) return;

  // Preserve authored ops + ambiguityResolution verbatim; only roles/columns change.
  const mergedPlan: DatasetInterpretationPlan = { ...authored, roles, columns };

  await asSystem(payload).update({
    collection: COLLECTION_NAMES.DATASETS,
    id: typeof dataset.id === "string" ? dataset.id : String(dataset.id),
    data: { interpretationPlan: mergedPlan as unknown as Record<string, unknown> },
  });
};

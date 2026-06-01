/**
 * Finds existing dataset configs that match the uploaded file's column headers.
 *
 * Pure function with no database dependency -- takes headers and datasets,
 * returns ranked suggestions for config reuse in the import wizard.
 *
 * @module
 * @category Services
 */

import { readInterpretationPlan } from "@/lib/ingest/interpret";
import type { DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";
import type { ConfigSuggestion } from "@/lib/ingest/types/wizard";
import type { Dataset } from "@/payload-types";

const MIN_SCORE = 40;
const MAX_RESULTS = 3;

/** Collect the input column names referenced by a plan's ops (rename/string-op `from`, concatenate `fromFields`, …). */
const collectPlanInputColumns = (plan: DatasetInterpretationPlan, columns: Set<string>): void => {
  for (const t of plan.ops) {
    if ("from" in t && typeof t.from === "string") columns.add(t.from);
    if (t.type === "concatenate") {
      for (const f of t.fromFields) columns.add(f);
    }
  }
};

/** Collect all column names a dataset "knows about" from schema + config. */
const getDatasetKnownColumns = (dataset: Dataset & { schemaColumns?: string[] }): string[] => {
  const columns = new Set<string>();

  // Primary source: schema properties from previous imports (most complete)
  if (dataset.schemaColumns) {
    for (const col of dataset.schemaColumns) columns.add(col);
  }

  const plan = readInterpretationPlan(dataset);
  if (plan) {
    // Fallback: authored role paths (only mapped fields)
    for (const path of Object.values(plan.roles)) {
      if (typeof path === "string" && path) columns.add(path);
    }
    // Fallback: input columns referenced by the authored ops
    collectPlanInputColumns(plan, columns);
  }

  return [...columns];
};

/** Calculate how well new headers match a dataset's known columns. */
const calculateMatchScore = (headers: string[], knownColumns: string[]): { score: number; matched: string[] } => {
  if (knownColumns.length === 0) return { score: 0, matched: [] };

  const headerSet = new Set(headers.map((h) => h.toLowerCase()));
  const matched: string[] = [];

  for (const col of knownColumns) {
    if (headerSet.has(col.toLowerCase())) {
      matched.push(col);
    }
  }

  // Score: matched / max(headers, knownColumns) * 100
  const denominator = Math.max(headers.length, knownColumns.length);
  const score = denominator > 0 ? Math.round((matched.length / denominator) * 100) : 0;

  return { score, matched };
};

/**
 * Find config suggestions by matching file headers against existing dataset configs.
 *
 * Returns up to `maxResults` datasets whose known columns overlap with the
 * provided headers above the minimum score threshold.
 */
export const findConfigSuggestions = (
  headers: string[],
  datasets: Array<Dataset & { catalogName?: string; catalogId?: number; schemaColumns?: string[] }>,
  maxResults: number = MAX_RESULTS
): ConfigSuggestion[] => {
  if (headers.length === 0) return [];

  const suggestions: ConfigSuggestion[] = [];

  for (const dataset of datasets) {
    const knownColumns = getDatasetKnownColumns(dataset);
    if (knownColumns.length === 0) continue;

    const { score, matched } = calculateMatchScore(headers, knownColumns);
    if (score < MIN_SCORE) continue;

    suggestions.push({
      datasetId: dataset.id,
      datasetName: dataset.name,
      catalogId: dataset.catalogId ?? 0,
      catalogName: dataset.catalogName ?? "",
      score,
      matchedColumns: matched,
      config: {
        interpretationPlan: readInterpretationPlan(dataset),
        idStrategy: dataset.idStrategy ?? { type: "content-hash" },
        deduplicationConfig: dataset.deduplicationConfig ?? { enabled: true },
        geocodingEnabled: dataset.geoFieldDetection?.autoDetect ?? false,
      },
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, maxResults);
};

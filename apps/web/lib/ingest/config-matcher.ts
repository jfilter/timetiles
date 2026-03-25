/**
 * Finds existing dataset configs that match the uploaded file's column headers.
 *
 * Pure function with no database dependency -- takes headers and datasets,
 * returns ranked suggestions for config reuse in the import wizard.
 *
 * @module
 * @category Services
 */

import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type { ConfigSuggestion } from "@/lib/types/ingest-wizard";
import type { Dataset } from "@/payload-types";

const MIN_SCORE = 40;
const MAX_RESULTS = 3;

/** Collect all column names a dataset "knows about" from schema + config. */
const getDatasetKnownColumns = (dataset: Dataset & { schemaColumns?: string[] }): string[] => {
  const columns = new Set<string>();

  // Primary source: schema properties from previous imports (most complete)
  if (dataset.schemaColumns) {
    for (const col of dataset.schemaColumns) columns.add(col);
  }

  // Fallback: field mapping overrides (only mapped fields)
  const overrides = dataset.fieldMappingOverrides;
  if (overrides) {
    for (const path of [
      overrides.titlePath,
      overrides.descriptionPath,
      overrides.locationNamePath,
      overrides.timestampPath,
      overrides.latitudePath,
      overrides.longitudePath,
      overrides.locationPath,
    ]) {
      if (path) columns.add(path);
    }
  }

  // Fallback: 'from' fields from transforms
  const transforms = dataset.ingestTransforms;
  if (Array.isArray(transforms)) {
    for (const t of transforms) {
      if (t && typeof t === "object" && "from" in t && typeof t.from === "string") {
        columns.add(t.from);
      }
    }
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

    const overrides = dataset.fieldMappingOverrides;
    suggestions.push({
      datasetId: dataset.id,
      datasetName: dataset.name,
      catalogId: dataset.catalogId ?? 0,
      catalogName: dataset.catalogName ?? "",
      score,
      matchedColumns: matched,
      config: {
        fieldMappingOverrides: overrides ?? {},
        ingestTransforms: (dataset.ingestTransforms ?? []) as IngestTransform[],
        idStrategy: dataset.idStrategy ?? { type: "content-hash" },
        deduplicationConfig: dataset.deduplicationConfig ?? { strategy: "skip" },
        geocodingEnabled: dataset.geoFieldDetection?.autoDetect ?? false,
      },
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, maxResults);
};

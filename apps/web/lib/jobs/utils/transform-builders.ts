/**
 * Shared utility for building typed IngestTransform arrays from dataset configuration.
 *
 * Used by both schema-detection-job and create-events-batch-job to ensure
 * all 6 transform types are handled consistently.
 *
 * @module
 * @category Jobs
 */
import type { IngestTransform } from "@/lib/types/ingest-transforms";
import type { Dataset } from "@/payload-types";

type DatasetTransformEntry = NonNullable<Dataset["ingestTransforms"]>[number];
type TransformBase = { id: string; active: true; autoDetected: boolean };

const buildRenameTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from && t.to ? { ...base, type: "rename", from: t.from, to: t.to } : null;

const buildDateParseTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from && t.inputFormat && t.outputFormat
    ? {
        ...base,
        type: "date-parse",
        from: t.from,
        inputFormat: t.inputFormat,
        outputFormat: t.outputFormat,
        timezone: t.timezone ?? undefined,
      }
    : null;

const buildStringOpTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from && t.operation
    ? {
        ...base,
        type: "string-op",
        from: t.from,
        // Cast needed: Payload-generated enum hasn't been regenerated to include "expression" yet
        operation: t.operation as "uppercase" | "lowercase" | "replace" | "expression",
        pattern: t.pattern ?? undefined,
        replacement: t.replacement ?? undefined,
        expression: (t as Record<string, unknown>).expression as string | undefined,
      }
    : null;

const buildConcatenateTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  Array.isArray(t.fromFields) && t.fromFields.length >= 2 && t.to
    ? { ...base, type: "concatenate", fromFields: t.fromFields as string[], separator: t.separator ?? " ", to: t.to }
    : null;

const buildSplitTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from && t.delimiter && Array.isArray(t.toFields) && t.toFields.length > 0
    ? { ...base, type: "split", from: t.from, delimiter: t.delimiter, toFields: t.toFields as string[] }
    : null;

const TRANSFORM_BUILDERS: Record<string, (t: DatasetTransformEntry, base: TransformBase) => IngestTransform | null> = {
  rename: buildRenameTransform,
  "date-parse": buildDateParseTransform,
  "string-op": buildStringOpTransform,
  concatenate: buildConcatenateTransform,
  split: buildSplitTransform,
};

/** Build typed IngestTransform[] from a dataset's ingestTransforms configuration. */
export const buildTransformsFromDataset = (dataset: Dataset): IngestTransform[] => {
  const transforms: IngestTransform[] = [];

  for (const t of dataset.ingestTransforms ?? []) {
    if (typeof t !== "object" || !t?.id || !t.type || t.active !== true) {
      continue;
    }

    const base: TransformBase = { id: t.id, active: true, autoDetected: Boolean(t.autoDetected) };
    const builder = TRANSFORM_BUILDERS[t.type];
    const transform = builder?.(t, base);

    if (transform) {
      transforms.push(transform);
    }
  }

  return transforms;
};

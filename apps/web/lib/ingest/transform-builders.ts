/**
 * Shared utility for normalizing loosely-typed transform entries into the typed
 * {@link IngestTransform} array, applying the canonical active/complete filter.
 *
 * This is the byte-identical authoring filter: the plan-builder funnels the
 * wizard/data-package transform array through it so the persisted `plan.ops`
 * matches the historical `dataset.ingestTransforms` round-trip exactly (drops
 * `active !== true` and incomplete entries; normalizes per-type fields). The
 * content-hash dedup ID hashes the row after these ops replay, so this filter is
 * load-bearing for dedup stability — never diverge it from a parallel filter.
 *
 * @module
 * @category Jobs
 */
import type { IngestTransform } from "@/lib/ingest/types/transforms";

/**
 * Loosely-typed transform entry (as authored/stored before normalization).
 *
 * Every field is optional with a wide value type so both the already-typed
 * {@link IngestTransform} union and raw stored/JSON entries are assignable. The
 * `expression`/`pattern`/`group`/`replacement` fields are read via cast in the
 * builders; they are declared here so a typed `IngestTransform` carrying them is
 * structurally compatible.
 */
type DatasetTransformEntry = {
  id?: string | null;
  type?: string | null;
  active?: boolean | null;
  autoDetected?: boolean | null;
  from?: string | null;
  to?: string | null;
  inputFormat?: string | null;
  outputFormat?: string | null;
  timezone?: string | null;
  operation?: string | null;
  pattern?: string | null;
  replacement?: string | null;
  expression?: string | null;
  group?: number | null;
  fromFields?: unknown;
  toFields?: unknown;
  separator?: string | null;
  delimiter?: string | null;
};

/** A source carrying a loosely-typed transform array (a dataset or a plan-builder shell). */
export interface TransformSource {
  ingestTransforms?: ReadonlyArray<DatasetTransformEntry | IngestTransform> | null;
}

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
        to: t.to ?? undefined,
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

const buildParseJsonArrayTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from ? { ...base, type: "parse-json-array", from: t.from, to: t.to ?? undefined } : null;

const buildSplitToArrayTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from
    ? { ...base, type: "split-to-array", from: t.from, to: t.to ?? undefined, delimiter: t.delimiter ?? undefined }
    : null;

const buildExtractTransform = (t: DatasetTransformEntry, base: TransformBase): IngestTransform | null =>
  t.from && t.to && (t as Record<string, unknown>).pattern
    ? {
        ...base,
        type: "extract",
        from: t.from,
        to: t.to,
        pattern: String((t as Record<string, unknown>).pattern),
        group:
          typeof (t as Record<string, unknown>).group === "number"
            ? Number((t as Record<string, unknown>).group)
            : undefined,
      }
    : null;

const TRANSFORM_BUILDERS: Record<string, (t: DatasetTransformEntry, base: TransformBase) => IngestTransform | null> = {
  rename: buildRenameTransform,
  "date-parse": buildDateParseTransform,
  "string-op": buildStringOpTransform,
  concatenate: buildConcatenateTransform,
  split: buildSplitTransform,
  "parse-json-array": buildParseJsonArrayTransform,
  "split-to-array": buildSplitToArrayTransform,
  extract: buildExtractTransform,
};

const getTransformOutputPaths = (transform: IngestTransform): string[] => {
  switch (transform.type) {
    case "rename":
      return [transform.to];
    case "date-parse":
      return [transform.from];
    case "string-op":
      return [transform.to ?? transform.from];
    case "concatenate":
      return [transform.to];
    case "split":
      return transform.toFields;
    case "parse-json-array":
      return [transform.to ?? transform.from];
    case "split-to-array":
      return [transform.to ?? transform.from];
    case "extract":
      return [transform.to];
  }
};

const getTransformInputPaths = (transform: IngestTransform): string[] => {
  switch (transform.type) {
    case "rename":
    case "date-parse":
    case "parse-json-array":
    case "split-to-array":
    case "extract":
      return [transform.from];
    case "string-op":
      return [transform.from];
    case "concatenate":
      return transform.fromFields;
    case "split":
      return [transform.from];
  }
};

/** Build typed IngestTransform[] from a loosely-typed transform array, applying the active/complete filter. */
export const buildTransformsFromDataset = (source: TransformSource): IngestTransform[] => {
  const transforms: IngestTransform[] = [];

  for (const t of source.ingestTransforms ?? []) {
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

/**
 * Collect the smallest ordered transform subset needed to produce a target path.
 *
 * Walks backward from the desired output path, adding transforms whose outputs
 * satisfy currently-needed paths and then expanding the dependency set with the
 * inputs those transforms read from.
 */
export const collectTransformsForTargetPath = (
  transforms: IngestTransform[],
  targetPath: string | null | undefined
): IngestTransform[] => {
  if (!targetPath) {
    return [];
  }

  const neededPaths = new Set([targetPath]);
  const selectedIndexes = new Set<number>();

  for (let index = transforms.length - 1; index >= 0; index--) {
    const transform = transforms[index];
    if (!transform) continue;

    const outputPaths = getTransformOutputPaths(transform);
    const satisfiesNeededPath = outputPaths.some((path) => neededPaths.has(path));
    if (!satisfiesNeededPath) {
      continue;
    }

    selectedIndexes.add(index);

    for (const outputPath of outputPaths) {
      if (neededPaths.has(outputPath)) {
        neededPaths.delete(outputPath);
      }
    }

    for (const inputPath of getTransformInputPaths(transform)) {
      neededPaths.add(inputPath);
    }
  }

  return transforms.filter((_transform, index) => selectedIndexes.has(index));
};

/** Build only the transforms required to materialize a specific target path. */
export const buildTransformsForTargetPath = (
  source: TransformSource,
  targetPath: string | null | undefined
): IngestTransform[] => collectTransformsForTargetPath(buildTransformsFromDataset(source), targetPath);

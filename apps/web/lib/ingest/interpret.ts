/**
 * The single normalizer for the unified interpretation model (ADR 0040).
 *
 * `interpretRow` replays a {@link DatasetInterpretationPlan}'s ordered structural
 * rewrites (`plan.ops`) against a raw row. It is the one code path both schema
 * detection and event creation route through, replacing the scattered
 * `applyTransforms` / `buildTransformsFromDataset` call sites.
 *
 * Phase 1 scope: the STRUCTURAL step only. By construction it is byte-identical
 * to the legacy path — `plan.ops` is the verbatim transform list, so applying it
 * equals `applyTransforms(row, transforms)`. The order-independent TYPED step
 * (consuming `plan.columns` policies for date/coordinate order) is layered on in
 * Phase 2; until then this is a pure structural shim guarded by the golden tests.
 *
 * The `only` projection mirrors `buildTransformsForTargetPath`: analyze-duplicates
 * needs just the ops that materialize the ID path (for `external`), so it must not
 * pay for — or risk altering — unrelated columns when computing the dedup hash.
 *
 * @module
 * @category Ingest
 */
import { applyTransforms } from "@/lib/ingest/transforms";
import { collectTransformsForTargetPath } from "@/lib/ingest/transform-builders";
import type { DatasetInterpretationPlan } from "@/lib/ingest/types/interpretation";
import type { IngestTransform } from "@/lib/ingest/types/transforms";

/**
 * Wrap an already-built ordered transform list as a minimal plan (ops only).
 *
 * Transitional helper for call sites that still receive `transforms` rather than
 * a dataset. `interpretRows(rows, planFromOps(transforms))` is byte-identical to
 * the legacy `applyTransformsBatch(rows, transforms)`. The typed `columns`/`roles`
 * are populated by `toPlan` from the dataset; sites using this shim only need the
 * structural step, which the ops carry. Removed once those sites take a full plan.
 */
export const planFromOps = (ops: IngestTransform[]): DatasetInterpretationPlan => ({
  ops,
  columns: [],
  roles: {},
  ambiguityResolution: "best-effort",
});

export interface InterpretRowOptions {
  /**
   * Restrict the structural rewrite to only the ops needed to materialize this
   * target path (the minimal ordered subset, exactly as
   * `collectTransformsForTargetPath` computes). Used by analyze-duplicates so the
   * content-hash dedup input is unchanged. When omitted, all ops are applied.
   */
  only?: string | null;
}

/**
 * Apply a plan's structural rewrites to one raw row, returning the rewritten row.
 *
 * Pure; never mutates the input (delegates to `applyTransforms`, which shallow-copies).
 */
export const interpretRow = (
  row: Record<string, unknown>,
  plan: DatasetInterpretationPlan,
  options?: InterpretRowOptions
): Record<string, unknown> => {
  const ops = options?.only ? collectTransformsForTargetPath(plan.ops, options.only) : plan.ops;
  return ops.length > 0 ? applyTransforms(row, ops) : row;
};

/** Batch convenience: apply the plan's structural rewrites to each row. */
export const interpretRows = (
  rows: Record<string, unknown>[],
  plan: DatasetInterpretationPlan,
  options?: InterpretRowOptions
): Record<string, unknown>[] => {
  const ops = options?.only ? collectTransformsForTargetPath(plan.ops, options.only) : plan.ops;
  if (ops.length === 0) return rows;
  return rows.map((row) => applyTransforms(row, ops));
};

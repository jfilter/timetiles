/**
 * Unified column-interpretation model for the ingest pipeline.
 *
 * This is the single declarative description of how each source column is turned
 * into its final typed event value. It unifies three previously-separate, partly
 * overlapping mechanisms:
 *
 * - `dataset.ingestTransforms` (the {@link IngestTransform} union) — structural and
 *   value rewrites applied before detection.
 * - `dataset.fieldMappingOverrides` — semantic field identity (which column is the
 *   title / timestamp / coordinate, …) plus the `coordinateFormat` interpretation knob.
 * - The implicit per-row guessing in `parseImportDate`/`extractCombinedCoordinates`
 *   at event-creation time (the source of the recurring "per-row vs per-column" bugs).
 *
 * The model is consumed by ONE normalizer (`@/lib/ingest/interpret` — `interpretRow`)
 * shared by both schema detection and event creation, eliminating the
 * pre-detection / post-detection interpretation seam.
 *
 * Phase 0 introduces the types and a pure `toPlan(dataset)` adapter only; no behavior
 * changes until later phases route the pipeline through `interpretRow`. See
 * `docs/adr/0040-unified-column-interpretation.md`.
 *
 * @module
 * @category Types
 */
import type { IngestTransform } from "@/lib/ingest/types/transforms";

/** Axis order for a single combined-coordinate column (e.g. "40.7,-74.0"). */
export type CoordinateOrder = "lat,lng" | "lng,lat";

/**
 * Day/month order for a date column.
 *
 * `iso` = unambiguous `YYYY-MM-DD`; `DMY`/`MDY`/`YMD` = numeric separated orders;
 * the text variants mirror the existing `FORMAT_PATTERNS` text formats in
 * `@/lib/utils/date-parsing`.
 */
export type DateOrder = "iso" | "DMY" | "MDY" | "YMD" | "D MMMM YYYY" | "MMMM D, YYYY";

/** The interpretation choices a detector can flag as needing a human decision. */
export type InterpretationChoice = "date-order" | "coordinate-order";

export interface DatePolicy {
  kind: "date";
  /** Resolved order; `undefined` means undecided (detector was ambiguous). */
  order?: DateOrder;
  timezone?: string;
}

export interface CoordinatePolicy {
  kind: "coordinate-pair";
  /** Resolved axis order; `undefined` means undecided (detector was ambiguous). */
  order?: CoordinateOrder;
  /** For a single combined column. Mutually exclusive with lat/lng sources. */
  combinedSource?: string;
  /** For two separate columns. */
  latitudeSource?: string;
  longitudeSource?: string;
}

export interface NumberPolicy {
  kind: "number";
}

export interface ArrayPolicy {
  kind: "string-array";
  /** Delimiter for split-to-array style columns; absent for JSON-array columns. */
  delimiter?: string;
}

export type InterpretationPolicy = DatePolicy | CoordinatePolicy | NumberPolicy | ArrayPolicy;

/** The typed kind a column resolves to. Mirrors the detector's per-column type decision. */
export type ColumnKind = "string" | "number" | "boolean" | "date" | "coordinate-pair" | "string-array";

/**
 * The order-INDEPENDENT, declarative interpretation of one column's FINAL value:
 * what typed kind it resolves to and the policy (date/coordinate order) used when
 * the typed-extraction step reads it.
 *
 * Structural rewrites (rename, string-op, concatenate, split, …) are NOT here —
 * they are inherently ordered and live in {@link DatasetInterpretationPlan.ops}
 * as a single replay list. Splitting "ordered structural rewrites" from
 * "declarative per-column typing" is what keeps normalization byte-identical to
 * the legacy `applyTransforms` (column-grouping the ops would reorder them — e.g.
 * a `string-op` authored *before* a `rename` of the same column).
 */
export interface ColumnInterpretation {
  /** The column name as it exists AFTER structural ops (i.e. a rename `to`, or the raw source). */
  field: string;
  /** The typed kind this column resolves to. */
  kind: ColumnKind;
  /** Kind-specific interpretation policy (date order, coordinate order, …). */
  policy?: InterpretationPolicy;
  /** Detection provenance and any unresolved interpretation choice. */
  detection?: {
    confidence: number;
    autoDetected: boolean;
    /** Set when the detector could not decide a policy and a human/config must choose. */
    requiresChoice?: InterpretationChoice;
  };
}

/**
 * The semantic role each event field plays, mapped to a source column name.
 * Replaces the path fields of `dataset.fieldMappingOverrides`.
 */
export interface InterpretationRoles {
  title?: string | null;
  description?: string | null;
  locationName?: string | null;
  timestamp?: string | null;
  endTimestamp?: string | null;
  location?: string | null;
  coordinate?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  id?: string | null;
}

/**
 * Policy for how ambiguous interpretations (date order, coordinate order) are resolved.
 *
 * - `strict` (default for new datasets): an ambiguous column yields no value and
 *   trips a review gate so the order is decided ONCE per column.
 * - `best-effort` (opt-in): the normalizer may guess per-row from each row's own
 *   disambiguating signal, falling back to a documented default; never pauses.
 */
export type AmbiguityResolution = "strict" | "best-effort";

/**
 * The full per-dataset interpretation plan: the single source of truth for
 * import → event interpretation, in two clearly-separated parts.
 *
 * Normalization is therefore a two-step pipeline whose first step is provably
 * byte-identical to the legacy path:
 * 1. **Structural rewrite** — replay {@link ops} in order (exactly the legacy
 *    `applyTransforms`). This is what the content-hash dedup ID is computed over,
 *    so order MUST be preserved; that is why ops is a single flat ordered list,
 *    not grouped per column.
 * 2. **Typed extraction** — read each {@link columns} entry's `field` from the
 *    rewritten row and apply its `kind`/`policy` (date order, coordinate order).
 *    This step is order-independent.
 */
export interface DatasetInterpretationPlan {
  /** Ordered structural rewrites — the exact legacy transform list (rename, date-parse, string-op, …). */
  ops: IngestTransform[];
  /** Order-independent per-column typing read after ops are applied. */
  columns: ColumnInterpretation[];
  roles: InterpretationRoles;
  ambiguityResolution: AmbiguityResolution;
}

/** A single value change produced by `interpretRow`, for transform-diff reporting. */
export interface InterpretationChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  error?: string;
}

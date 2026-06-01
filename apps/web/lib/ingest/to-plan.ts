/**
 * Pure adapter: derive a {@link DatasetInterpretationPlan} from a dataset's
 * CURRENT configuration (`ingestTransforms` + `fieldMappingOverrides` +
 * `coordinateFormat`).
 *
 * This is the Phase-0 read model. It introduces NO behavior change — it only
 * re-expresses today's scattered config as the unified plan shape so later phases
 * can route the pipeline through one normalizer (`@/lib/ingest/interpret`). Until
 * those phases land, `toPlan` is consumed only by golden tests that assert the
 * plan faithfully reconstructs current transform/role behavior.
 *
 * Mapping rules (1:1 with the existing mechanisms):
 * - `rename` transform → the column's `target`.
 * - `date-parse` transform → a {@link DatePolicy} on the (renamed) column.
 * - every other transform → a `ValueOp` in the column's `ops`, in original order.
 * - `fieldMappingOverrides` paths → `roles`.
 * - `fieldMappingOverrides.coordinateFormat` → the coordinate column's
 *   {@link CoordinatePolicy} order ("ambiguous"/unset → undefined order).
 *
 * @module
 * @category Ingest
 */
import type {
  ColumnInterpretation,
  CoordinateOrder,
  DatasetInterpretationPlan,
  DateOrder,
  InterpretationRoles,
} from "@/lib/ingest/types/interpretation";
import { buildTransformsFromDataset } from "@/lib/ingest/transform-builders";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { Dataset } from "@/payload-types";

/** Map a `date-parse` transform's `inputFormat` to a {@link DateOrder}, or undefined if unrecognized. */
const inputFormatToOrder = (inputFormat: string): DateOrder | undefined => {
  const fmt = inputFormat.trim();
  if (fmt === "D MMMM YYYY" || fmt === "MMMM D, YYYY") return fmt;
  // FORMAT_PATTERNS keys (date-parsing.ts): DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, etc.
  if (fmt.startsWith("YYYY")) return "YMD";
  if (fmt.startsWith("DD")) return "DMY";
  if (fmt.startsWith("MM")) return "MDY";
  return undefined;
};

/** Normalize a stored coordinateFormat to a resolved order (ambiguous/unset → undefined). */
const toCoordinateOrder = (format: string | null | undefined): CoordinateOrder | undefined =>
  format === "lat,lng" || format === "lng,lat" ? format : undefined;

/**
 * Derive the order-INDEPENDENT per-column typing from the transform list + overrides.
 *
 * The ordered ops themselves are NOT rebuilt here (they are the verbatim transform
 * list on the plan); this only records what each FINAL column resolves to. A
 * `date-parse` transform tells us its output column is a date (keyed by the
 * post-rewrite field name, which it writes via `outputFormat`); the coordinate
 * override tells us the coordinate column's axis order.
 */
const buildColumns = (
  transforms: IngestTransform[],
  overrides: NonNullable<Dataset["fieldMappingOverrides"]> | null | undefined
): ColumnInterpretation[] => {
  const byField = new Map<string, ColumnInterpretation>();
  const upsert = (field: string, patch: Omit<Partial<ColumnInterpretation>, "field">): void => {
    byField.set(field, { kind: "string", ...byField.get(field), ...patch, field });
  };

  for (const t of transforms) {
    if (t.type === "date-parse") {
      // date-parse writes to `from` (in place); its column resolves to a date.
      upsert(t.from, {
        kind: "date",
        policy: { kind: "date", order: inputFormatToOrder(t.inputFormat), timezone: t.timezone },
      });
    }
  }

  const coordinateSource = overrides?.coordinatePath ?? null;
  if (coordinateSource) {
    upsert(coordinateSource, {
      kind: "coordinate-pair",
      policy: {
        kind: "coordinate-pair",
        order: toCoordinateOrder(overrides?.coordinateFormat),
        combinedSource: coordinateSource,
      },
    });
  }

  return [...byField.values()];
};

/** Derive the semantic roles map from `fieldMappingOverrides` paths. */
const buildRoles = (
  overrides: NonNullable<Dataset["fieldMappingOverrides"]> | null | undefined
): InterpretationRoles => ({
  title: overrides?.titlePath ?? null,
  description: overrides?.descriptionPath ?? null,
  locationName: overrides?.locationNamePath ?? null,
  timestamp: overrides?.timestampPath ?? null,
  endTimestamp: overrides?.endTimestampPath ?? null,
  location: overrides?.locationPath ?? null,
  coordinate: overrides?.coordinatePath ?? null,
  latitude: overrides?.latitudePath ?? null,
  longitude: overrides?.longitudePath ?? null,
});

/**
 * Build a {@link DatasetInterpretationPlan} from a dataset's current configuration.
 *
 * Pure and read-only. Defaults `ambiguityResolution` to `best-effort` to preserve
 * today's behavior for existing datasets (per-row guessing is the current default);
 * the wizard will set `strict` for new datasets in a later phase.
 */
export const toPlan = (dataset: Dataset): DatasetInterpretationPlan => {
  const ops = buildTransformsFromDataset(dataset);
  const overrides = dataset.fieldMappingOverrides;
  return {
    ops,
    columns: buildColumns(ops, overrides),
    roles: buildRoles(overrides),
    ambiguityResolution: "best-effort",
  };
};

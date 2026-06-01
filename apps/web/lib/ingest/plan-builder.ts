/**
 * Pure builders for the canonical {@link DatasetInterpretationPlan}.
 *
 * The plan is persisted verbatim (Payload `type: "json"`) on both `datasets`
 * (the wizard/data-package AUTHORED plan — pre-detection intent) and
 * `ingest-jobs` (the DETECTION-RESOLVED plan — authored ops + detected/merged
 * roles + resolved column policies). These helpers are the single place that
 * assembles either form so the ordered `ops` list, the per-column policies, and
 * the role map stay consistent across the writer call sites.
 *
 * The structural `ops` list is the load-bearing dedup-stability surface: the
 * content-hash uniqueId hashes the row AFTER `ops` is replayed. The wizard
 * builders therefore funnel the typed transform array through
 * {@link buildTransformsFromDataset} so the authored ops are byte-identical to
 * the legacy `dataset.ingestTransforms` round-trip (same active/complete
 * filter, same per-type field normalization).
 *
 * @module
 * @category Ingest
 */
import { buildTransformsFromDataset } from "@/lib/ingest/transform-builders";
import type {
  AmbiguityResolution,
  ColumnInterpretation,
  CoordinateOrder,
  DatasetInterpretationPlan,
  DateOrder,
  InterpretationRoles,
} from "@/lib/ingest/types/interpretation";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping } from "@/lib/ingest/types/wizard";
import type { DayMonthOrder } from "@/lib/utils/date-parsing";

// ---------------------------------------------------------------------------
// Order converters (legacy free-text <-> DateOrder/CoordinateOrder)
// ---------------------------------------------------------------------------

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

/** Normalize a free-text coordinate order ("ambiguous"/unset → undefined). */
export const toCoordinateOrder = (format: string | null | undefined): CoordinateOrder | undefined =>
  format === "lat,lng" || format === "lng,lat" ? format : undefined;

/**
 * Map the detector's free-text day/month order ("D/M" | "M/D" | "ambiguous" |
 * null) to a {@link DateOrder}, or undefined when the order is undecided.
 *
 * The detector emits "D/M"/"M/D"; the plan stores the unambiguous DMY/MDY
 * variants. An "ambiguous"/null/unset order yields `undefined` — the column
 * policy then carries `requiresChoice` so the review gate / extractor treats it
 * as undecided rather than guessing.
 */
export const legacyDayMonthToDateOrder = (order: string | null | undefined): DateOrder | undefined => {
  if (order === "D/M") return "DMY";
  if (order === "M/D") return "MDY";
  return undefined;
};

/**
 * Map a resolved {@link DateOrder} back to the legacy free-text "D/M"/"M/D" the
 * extractors and the approve-route Zod contract speak. Only the day/month-bearing
 * numeric orders have a legacy form; everything else (iso, YMD, text formats,
 * undefined) yields `undefined` so the extractor keeps its non-explicit path.
 */
export const dateOrderToLegacyDayMonth = (order: DateOrder | undefined): DayMonthOrder | undefined => {
  if (order === "DMY") return "D/M";
  if (order === "MDY") return "M/D";
  return undefined;
};

/** Map a resolved {@link CoordinateOrder} back to the free-text the extractors speak. */
export const coordinateOrderToLegacy = (order: CoordinateOrder | undefined): "lat,lng" | "lng,lat" | undefined => order;

// ---------------------------------------------------------------------------
// Column derivation
// ---------------------------------------------------------------------------

/** Inputs describing a coordinate column policy in either combined or split form. */
interface CoordinateColumnInput {
  /** Single combined-coordinate column ("lat,lng" string). */
  combinedSource?: string | null;
  /** Two separate axis columns. */
  latitudeSource?: string | null;
  longitudeSource?: string | null;
  /** Resolved axis order; undefined = undecided (ambiguous). */
  order?: CoordinateOrder;
  /** True when the detector could not settle the order and a human/config must choose. */
  requiresChoice?: boolean;
}

/** Inputs describing a date column policy. */
interface DateColumnInput {
  field: string;
  /** Resolved day/month order; undefined = undecided (ambiguous). */
  order?: DateOrder;
  timezone?: string;
  /** True when the detector could not settle the order and a human/config must choose. */
  requiresChoice?: boolean;
}

/**
 * Derive the order-INDEPENDENT per-column typing from the ordered ops plus the
 * coordinate/date column inputs.
 *
 * The ordered ops are NOT rebuilt here (they are the verbatim transform list on
 * the plan); this only records what each FINAL column resolves to. A
 * `date-parse` op tells us its (in-place) column resolves to a date; the
 * coordinate input tells us the coordinate column's axis order. Explicit
 * date/coordinate inputs win over the op-derived defaults (the detector/approve
 * flow resolves a more specific order than `inputFormat` alone).
 */
const buildColumns = (
  ops: IngestTransform[],
  coordinate: CoordinateColumnInput | null,
  dates: DateColumnInput[]
): ColumnInterpretation[] => {
  const byField = new Map<string, ColumnInterpretation>();
  const upsert = (field: string, patch: Omit<Partial<ColumnInterpretation>, "field">): void => {
    byField.set(field, { kind: "string", ...byField.get(field), ...patch, field });
  };

  for (const t of ops) {
    if (t.type === "date-parse") {
      upsert(t.from, {
        kind: "date",
        policy: { kind: "date", order: inputFormatToOrder(t.inputFormat), timezone: t.timezone },
      });
    }
  }

  for (const date of dates) {
    if (!date.field) continue;
    upsert(date.field, {
      kind: "date",
      policy: { kind: "date", order: date.order, timezone: date.timezone },
      ...(date.requiresChoice
        ? { detection: { confidence: 0, autoDetected: true, requiresChoice: "date-order" } }
        : {}),
    });
  }

  const coordinateField = coordinate?.combinedSource ?? null;
  if (coordinateField) {
    upsert(coordinateField, {
      kind: "coordinate-pair",
      policy: {
        kind: "coordinate-pair",
        order: coordinate?.order,
        combinedSource: coordinateField,
        latitudeSource: coordinate?.latitudeSource ?? undefined,
        longitudeSource: coordinate?.longitudeSource ?? undefined,
      },
      ...(coordinate?.requiresChoice
        ? { detection: { confidence: 0, autoDetected: true, requiresChoice: "coordinate-order" } }
        : {}),
    });
  }

  return [...byField.values()];
};

// ---------------------------------------------------------------------------
// Roles mapping (wizard FieldMapping -> InterpretationRoles)
// ---------------------------------------------------------------------------

/** Map a wizard {@link FieldMapping} to the semantic {@link InterpretationRoles}. */
export const fieldMappingToRoles = (fieldMapping: FieldMapping | undefined): InterpretationRoles => {
  if (!fieldMapping) return {};
  return {
    title: fieldMapping.titleField,
    description: fieldMapping.descriptionField,
    locationName: fieldMapping.locationNameField,
    timestamp: fieldMapping.dateField,
    endTimestamp: fieldMapping.endDateField,
    location: fieldMapping.locationField,
    coordinate: fieldMapping.coordinateField,
    latitude: fieldMapping.latitudeField,
    longitude: fieldMapping.longitudeField,
    id: fieldMapping.idField,
  };
};

// ---------------------------------------------------------------------------
// Plan assembly
// ---------------------------------------------------------------------------

/** Run the typed wizard transforms through the exact legacy filter/normalization. */
const filterAuthoredOps = (transforms: IngestTransform[] | undefined): IngestTransform[] => {
  if (!transforms || transforms.length === 0) return [];
  // Route through buildTransformsFromDataset so the authored ops are byte-identical
  // to today's dataset.ingestTransforms round-trip (drops active!==true and
  // incomplete entries, normalizes per-type fields). This is the dedup-stability
  // guarantee (RISK 1) — never hand-filter here.
  return buildTransformsFromDataset({ ingestTransforms: transforms });
};

/**
 * Build the AUTHORED dataset plan from a wizard {@link FieldMapping} + the typed
 * transform array (pre-detection intent).
 *
 * - `ops` = the authored transforms after the legacy active/complete filter.
 * - `roles` = the FieldMapping projected to {@link InterpretationRoles}.
 * - `columns` = coordinate policy from the coordinate field (order undecided —
 *   the detector/approve flow resolves it) + any date-parse-derived policies.
 * - `ambiguityResolution` = caller-supplied (wizard datasets default to
 *   `strict`: the user explicitly configured mappings, so orders are decided once).
 */
export const buildPlanFromWizard = (
  fieldMapping: FieldMapping | undefined,
  transforms: IngestTransform[] | undefined,
  ambiguityResolution: AmbiguityResolution
): DatasetInterpretationPlan => {
  const ops = filterAuthoredOps(transforms);
  const roles = fieldMappingToRoles(fieldMapping);
  const coordinate = roles.coordinate ? { combinedSource: roles.coordinate } : null;
  return { ops, columns: buildColumns(ops, coordinate, []), roles, ambiguityResolution };
};

/** Roles + free-text orders for the data-package AUTHORED plan. */
export interface PlanRolesInput {
  titlePath?: string | null;
  descriptionPath?: string | null;
  locationNamePath?: string | null;
  timestampPath?: string | null;
  endTimestampPath?: string | null;
  locationPath?: string | null;
  latitudePath?: string | null;
  longitudePath?: string | null;
  coordinatePath?: string | null;
  idPath?: string | null;
  coordinateFormat?: string | null;
  timestampOrder?: string | null;
  endTimestampOrder?: string | null;
}

/** Project a flat path/order record to {@link InterpretationRoles}. */
export const pathsToRoles = (paths: PlanRolesInput): InterpretationRoles => ({
  title: paths.titlePath ?? null,
  description: paths.descriptionPath ?? null,
  locationName: paths.locationNamePath ?? null,
  timestamp: paths.timestampPath ?? null,
  endTimestamp: paths.endTimestampPath ?? null,
  location: paths.locationPath ?? null,
  coordinate: paths.coordinatePath ?? null,
  latitude: paths.latitudePath ?? null,
  longitude: paths.longitudePath ?? null,
  id: paths.idPath ?? null,
});

/**
 * Build an AUTHORED plan from a flat path/order record (data-package manifests).
 *
 * Same shape as {@link buildPlanFromWizard} but sourced from `*Path` fields plus
 * any explicitly declared free-text orders (a manifest can pin the coordinate /
 * date order so the ambiguous-order gate never fires for unattended imports).
 */
export const buildPlanFromPaths = (
  paths: PlanRolesInput,
  transforms: IngestTransform[] | undefined,
  ambiguityResolution: AmbiguityResolution
): DatasetInterpretationPlan => {
  const ops = filterAuthoredOps(transforms);
  const roles = pathsToRoles(paths);
  const coordinate = roles.coordinate
    ? { combinedSource: roles.coordinate, order: toCoordinateOrder(paths.coordinateFormat) }
    : null;
  const dates: DateColumnInput[] = [];
  if (roles.timestamp) dates.push({ field: roles.timestamp, order: legacyDayMonthToDateOrder(paths.timestampOrder) });
  if (roles.endTimestamp)
    dates.push({ field: roles.endTimestamp, order: legacyDayMonthToDateOrder(paths.endTimestampOrder) });
  return { ops, columns: buildColumns(ops, coordinate, dates), roles, ambiguityResolution };
};

/** Detector field-mapping inputs for the DETECTION-RESOLVED job plan. */
export interface DetectionPlanInput {
  titlePath?: string | null;
  descriptionPath?: string | null;
  locationNamePath?: string | null;
  timestampPath?: string | null;
  endTimestampPath?: string | null;
  locationPath?: string | null;
  latitudePath?: string | null;
  longitudePath?: string | null;
  coordinatePath?: string | null;
  /** Free text: "lat,lng" | "lng,lat" | "ambiguous" | null. */
  coordinateFormat?: string | null;
  /** Free text: "D/M" | "M/D" | "ambiguous" | null. */
  timestampOrder?: string | null;
  endTimestampOrder?: string | null;
}

/** True when a detector free-text order value signals an unresolved choice. */
const isUndecidedOrder = (value: string | null | undefined): boolean =>
  value == null || value === "" || value === "ambiguous";

/**
 * Build the DETECTION-RESOLVED job plan: authored `ops` + the merged detector
 * field mappings (roles) + resolved column policies.
 *
 * The AMBIGUOUS sentinel is preserved semantically — a `coordinateFormat ===
 * "ambiguous"` (or null) maps to a coordinate policy with `order: undefined` +
 * `detection.requiresChoice: "coordinate-order"`; the date orders behave
 * identically. The in-memory flat field mappings still carry the sentinel for
 * the review gates (which fire before this plan is persisted); the plan is the
 * persisted form.
 */
export const buildDetectionPlan = (
  ops: IngestTransform[],
  detection: DetectionPlanInput,
  ambiguityResolution: AmbiguityResolution
): DatasetInterpretationPlan => {
  const roles: InterpretationRoles = {
    title: detection.titlePath ?? null,
    description: detection.descriptionPath ?? null,
    locationName: detection.locationNamePath ?? null,
    timestamp: detection.timestampPath ?? null,
    endTimestamp: detection.endTimestampPath ?? null,
    location: detection.locationPath ?? null,
    coordinate: detection.coordinatePath ?? null,
    latitude: detection.latitudePath ?? null,
    longitude: detection.longitudePath ?? null,
  };

  const coordinate: CoordinateColumnInput | null = roles.coordinate
    ? {
        combinedSource: roles.coordinate,
        order: toCoordinateOrder(detection.coordinateFormat),
        requiresChoice: isUndecidedOrder(detection.coordinateFormat),
      }
    : null;

  const dates: DateColumnInput[] = [];
  if (roles.timestamp) {
    dates.push({
      field: roles.timestamp,
      order: legacyDayMonthToDateOrder(detection.timestampOrder),
      requiresChoice: isUndecidedOrder(detection.timestampOrder),
    });
  }
  if (roles.endTimestamp) {
    dates.push({
      field: roles.endTimestamp,
      order: legacyDayMonthToDateOrder(detection.endTimestampOrder),
      requiresChoice: isUndecidedOrder(detection.endTimestampOrder),
    });
  }

  return { ops, columns: buildColumns(ops, coordinate, dates), roles, ambiguityResolution };
};

// ---------------------------------------------------------------------------
// Plan -> flat field mappings (read adapters)
// ---------------------------------------------------------------------------

/** The flat field-mapping shape the event-creation extractors consume. */
export interface FlatPlanFieldMappings {
  titlePath?: string | null;
  descriptionPath?: string | null;
  locationNamePath?: string | null;
  timestampPath?: string | null;
  endTimestampPath?: string | null;
  locationPath?: string | null;
  latitudePath?: string | null;
  longitudePath?: string | null;
  coordinatePath?: string | null;
  coordinateFormat?: string | null;
  timestampOrder?: string | null;
  endTimestampOrder?: string | null;
}

/** Read a column's policy by field name, narrowing to the requested kind. */
const findColumnPolicy = (
  plan: DatasetInterpretationPlan,
  field: string | null | undefined
): ColumnInterpretation["policy"] | undefined =>
  field ? plan.columns.find((c) => c.field === field)?.policy : undefined;

/**
 * Project a plan back to the flat field-mapping shape the event-creation
 * extractors (`extractCoordinates`/`extractTimestamp`) already expect.
 *
 * Coordinate column policy.order → "lat,lng"/"lng,lat"; timestamp/endTimestamp
 * date policy.order → "D/M"/"M/D". An undefined/undecided order yields
 * `undefined` (NOT "ambiguous") — the extractors treat anything non-explicit as
 * undecided and fall through.
 */
export const planToFieldMappings = (plan: DatasetInterpretationPlan | null): FlatPlanFieldMappings => {
  if (!plan) return {};
  const { roles } = plan;
  const coordPolicy = findColumnPolicy(plan, roles.coordinate);
  const tsPolicy = findColumnPolicy(plan, roles.timestamp);
  const endTsPolicy = findColumnPolicy(plan, roles.endTimestamp);

  return {
    titlePath: roles.title ?? undefined,
    descriptionPath: roles.description ?? undefined,
    locationNamePath: roles.locationName ?? undefined,
    timestampPath: roles.timestamp ?? undefined,
    endTimestampPath: roles.endTimestamp ?? undefined,
    locationPath: roles.location ?? undefined,
    latitudePath: roles.latitude ?? undefined,
    longitudePath: roles.longitude ?? undefined,
    coordinatePath: roles.coordinate ?? undefined,
    coordinateFormat: coordPolicy?.kind === "coordinate-pair" ? coordinateOrderToLegacy(coordPolicy.order) : undefined,
    timestampOrder: tsPolicy?.kind === "date" ? dateOrderToLegacyDayMonth(tsPolicy.order) : undefined,
    endTimestampOrder: endTsPolicy?.kind === "date" ? dateOrderToLegacyDayMonth(endTsPolicy.order) : undefined,
  };
};

/** The five-field subset persisted on `dataset-schemas.fieldMappings`. */
export const planToSchemaFieldMappings = (
  plan: DatasetInterpretationPlan | null
): {
  titlePath?: string | null;
  descriptionPath?: string | null;
  locationNamePath?: string | null;
  timestampPath?: string | null;
  endTimestampPath?: string | null;
} => {
  if (!plan) return {};
  return {
    titlePath: plan.roles.title ?? undefined,
    descriptionPath: plan.roles.description ?? undefined,
    locationNamePath: plan.roles.locationName ?? undefined,
    timestampPath: plan.roles.timestamp ?? undefined,
    endTimestampPath: plan.roles.endTimestamp ?? undefined,
  };
};

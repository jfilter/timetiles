/**
 * Approves a NEEDS_REVIEW import job, optionally setting field mapping overrides.
 *
 * This endpoint handles all review reasons:
 * - For `no-timestamp` / `no-location`: optionally accepts a field path to set
 *   as a dataset override before approving (column picker flow).
 * - For all reasons: sets `schemaValidation.approved = true`, which triggers
 *   the afterChange hook to queue the resume workflow.
 *
 * POST /api/ingest-jobs/:id/approve
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, ForbiddenError, safeFindByID, ValidationError } from "@/lib/api";
import { COLLECTION_NAMES, PROCESSING_STAGE } from "@/lib/constants/ingest-constants";
import { readInterpretationPlan } from "@/lib/ingest/interpret";
import { legacyDayMonthToDateOrder, toCoordinateOrder } from "@/lib/ingest/plan-builder";
import type {
  CoordinateOrder,
  DatasetInterpretationPlan,
  DateOrder,
  InterpretationRoles,
} from "@/lib/ingest/types/interpretation";
import { readConfigSnapshot } from "@/lib/jobs/utils/resource-loading";
import { REVIEW_REASONS } from "@/lib/jobs/workflows/review-checks";
import { logger } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";
import type { IngestJob } from "@/payload-types";

const bodySchema = z
  .object({
    /** For no-timestamp: column name to use as timestamp field. */
    timestampPath: z.string().optional(),
    /** For no-location: column name to use as location/address field. */
    locationPath: z.string().optional(),
    /** For no-location: column name to use as venue/place field. */
    locationNamePath: z.string().optional(),
    /** For no-location: column name for latitude. */
    latitudePath: z.string().optional(),
    /** For no-location: column name for longitude. */
    longitudePath: z.string().optional(),
    /** For ambiguous-coordinate-order: the confirmed axis order of the combined column. */
    coordinateFormat: z.enum(["lat,lng", "lng,lat"]).optional(),
    /** For ambiguous-date-order: the confirmed day/month order of the timestamp column. */
    timestampOrder: z.enum(["D/M", "M/D"]).optional(),
    /** For ambiguous-date-order: the confirmed day/month order of the end timestamp column. */
    endTimestampOrder: z.enum(["D/M", "M/D"]).optional(),
  })
  .optional();

type ApproveBody = z.infer<typeof bodySchema>;

/** True if the column-picker body carries any path or order pick to apply. */
const hasOverridePicks = (body: ApproveBody): boolean =>
  [
    body?.timestampPath,
    body?.locationPath,
    body?.locationNamePath,
    body?.latitudePath,
    body?.longitudePath,
    body?.coordinateFormat,
    body?.timestampOrder,
    body?.endTimestampOrder,
  ].some(Boolean);

/** Map of role keys → the body path-pick that should overwrite them. */
const ROLE_PATH_PICKS = [
  ["timestamp", "timestampPath"],
  ["location", "locationPath"],
  ["locationName", "locationNamePath"],
  ["latitude", "latitudePath"],
  ["longitude", "longitudePath"],
] as const;

/** Overlay one column's date policy order onto a plan (creating the column if absent). */
const setDateColumnOrder = (
  plan: DatasetInterpretationPlan,
  field: string | null | undefined,
  order: DateOrder | undefined
): void => {
  if (!field || !order) return;
  const existing = plan.columns.find((c) => c.field === field);
  if (existing) {
    existing.kind = "date";
    existing.policy = { ...existing.policy, kind: "date", order };
    if (existing.detection) existing.detection = { ...existing.detection, requiresChoice: undefined };
  } else {
    plan.columns.push({ field, kind: "date", policy: { kind: "date", order } });
  }
};

/** Overlay the coordinate column's axis order onto a plan (creating the column if absent). */
const setCoordinateColumnOrder = (
  plan: DatasetInterpretationPlan,
  field: string | null | undefined,
  order: CoordinateOrder | undefined
): void => {
  if (!field || !order) return;
  const existing = plan.columns.find((c) => c.field === field);
  if (existing) {
    existing.kind = "coordinate-pair";
    existing.policy = { ...existing.policy, kind: "coordinate-pair", order, combinedSource: field };
    if (existing.detection) existing.detection = { ...existing.detection, requiresChoice: undefined };
  } else {
    plan.columns.push({
      field,
      kind: "coordinate-pair",
      policy: { kind: "coordinate-pair", order, combinedSource: field },
    });
  }
};

/**
 * Patch a plan with the column-picker body: path picks → roles, order picks →
 * the matching column policy. Returns a NEW plan (does not mutate the input),
 * or null when there is nothing to apply.
 */
const patchPlanFromBody = (
  base: DatasetInterpretationPlan | null,
  body: ApproveBody
): DatasetInterpretationPlan | null => {
  if (!hasOverridePicks(body)) return null;

  const plan: DatasetInterpretationPlan = base
    ? { ...base, roles: { ...base.roles }, columns: base.columns.map((c) => ({ ...c })) }
    : { ops: [], columns: [], roles: {}, ambiguityResolution: "best-effort" };

  const roles = plan.roles as InterpretationRoles & Record<string, string | null | undefined>;
  for (const [roleKey, bodyKey] of ROLE_PATH_PICKS) {
    const value = body?.[bodyKey];
    if (value) roles[roleKey] = value;
  }

  // Order picks resolve the column policy. The role must already point at the
  // column (set above for new picks, or carried by the plan from detection).
  setDateColumnOrder(plan, roles.timestamp, legacyDayMonthToDateOrder(body?.timestampOrder));
  setDateColumnOrder(plan, roles.endTimestamp, legacyDayMonthToDateOrder(body?.endTimestampOrder));
  setCoordinateColumnOrder(plan, roles.coordinate, toCoordinateOrder(body?.coordinateFormat));

  return plan;
};

/**
 * Apply column-picker / order-confirm picks to the canonical interpretation plan.
 *
 * Writes the resolved plan to BOTH the dataset (so a resume re-derives the same
 * resolved plan — this replaces the override-precedence-on-resume mechanism) and
 * the in-flight job (so the resume reads the resolved orders immediately), plus
 * the job's configSnapshot (frozen authored plan). Returns true if applied.
 */
const applyFieldMappingOverrides = async (
  payload: Parameters<Parameters<typeof apiRoute>[0]["handler"]>[0]["payload"],
  ingestJob: IngestJob,
  body: ApproveBody,
  ingestJobId: string
): Promise<boolean> => {
  if (!hasOverridePicks(body)) return false;

  const datasetId = extractRelationId(ingestJob.dataset);
  if (!datasetId) return false;

  const dataset = await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetId });

  // Patch the AUTHORED dataset plan so resume re-derives the resolved orders.
  const datasetPlan = patchPlanFromBody(readInterpretationPlan(dataset), body);
  if (datasetPlan) {
    await payload.update({
      collection: COLLECTION_NAMES.DATASETS,
      id: datasetId,
      data: { interpretationPlan: datasetPlan as unknown as Record<string, unknown> },
    });
  }

  // Patch the in-flight JOB plan so the immediate resume reads the resolved orders.
  const jobPlan = patchPlanFromBody(readInterpretationPlan(ingestJob), body);

  // Freeze the resolved authored plan onto the configSnapshot for deterministic resume.
  const snapshot = readConfigSnapshot(ingestJob);
  const configSnapshotUpdate =
    snapshot && datasetPlan ? { configSnapshot: { ...snapshot, interpretationPlan: datasetPlan } } : undefined;

  await payload.update({
    collection: COLLECTION_NAMES.INGEST_JOBS,
    id: ingestJobId,
    data: {
      ...(jobPlan ? { interpretationPlan: jobPlan as unknown as Record<string, unknown> } : {}),
      ...configSnapshotUpdate,
    },
  });

  logger.info("Resolved interpretation plan from column picker before approval", { datasetId, ingestJobId });

  return true;
};

export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  body: bodySchema,
  handler: async ({ payload, user, params, body }) => {
    const { id } = params;

    // Get the import job with access control
    const ingestJob = await safeFindByID(payload, { collection: "ingest-jobs", id, depth: 1, user });

    // Verify job is in needs-review state
    if (ingestJob.stage !== PROCESSING_STAGE.NEEDS_REVIEW) {
      throw new ValidationError(`Import job is not awaiting review. Current stage: ${ingestJob.stage}`);
    }

    // Admin-only gate for quota-exceeded
    if (ingestJob.reviewReason === REVIEW_REASONS.QUOTA_EXCEEDED && user.role !== "admin") {
      throw new ForbiddenError(
        "Only admins can approve quota-exceeded imports. Please contact us to increase your limit."
      );
    }

    // If user provided field mapping overrides (column picker), set them on the dataset
    const hasOverrides = await applyFieldMappingOverrides(payload, ingestJob, body, id);

    // Approve by setting schemaValidation.approved = true
    // The afterChange hook handles: skip flags, workflow queueing, or marking completed
    await payload.update({
      collection: COLLECTION_NAMES.INGEST_JOBS,
      id,
      data: { schemaValidation: { ...ingestJob.schemaValidation, approved: true } },
      user,
    });

    logger.info("Import job approved via API", {
      ingestJobId: id,
      reviewReason: ingestJob.reviewReason,
      userId: user.id,
      hasOverrides,
    });

    return { message: "Import approved", reviewReason: ingestJob.reviewReason, fieldOverridesApplied: hasOverrides };
  },
});

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
    /** For no-location: column name for latitude. */
    latitudePath: z.string().optional(),
    /** For no-location: column name for longitude. */
    longitudePath: z.string().optional(),
  })
  .optional();

type ApproveBody = z.infer<typeof bodySchema>;

/**
 * Apply field mapping overrides from the column picker to the dataset.
 * Returns true if overrides were applied.
 */
const applyFieldMappingOverrides = async (
  payload: Parameters<Parameters<typeof apiRoute>[0]["handler"]>[0]["payload"],
  ingestJob: IngestJob,
  body: ApproveBody,
  ingestJobId: string
): Promise<boolean> => {
  const hasOverrides = [body?.timestampPath, body?.locationPath, body?.latitudePath, body?.longitudePath].some(Boolean);
  if (!hasOverrides) return false;

  const datasetId = extractRelationId(ingestJob.dataset);
  if (!datasetId) return false;

  const dataset = await payload.findByID({ collection: COLLECTION_NAMES.DATASETS, id: datasetId });
  const existingOverrides = dataset?.fieldMappingOverrides ?? {};

  const overrideUpdate: Record<string, string> = {};
  if (body?.timestampPath) overrideUpdate.timestampPath = body.timestampPath;
  if (body?.locationPath) overrideUpdate.locationPath = body.locationPath;
  if (body?.latitudePath) overrideUpdate.latitudePath = body.latitudePath;
  if (body?.longitudePath) overrideUpdate.longitudePath = body.longitudePath;

  await payload.update({
    collection: COLLECTION_NAMES.DATASETS,
    id: datasetId,
    data: { fieldMappingOverrides: { ...existingOverrides, ...overrideUpdate } },
  });

  logger.info("Set field mapping overrides on dataset before approval", {
    datasetId,
    overrides: overrideUpdate,
    ingestJobId,
  });

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
    const ingestJob = await safeFindByID<IngestJob>(payload, { collection: "ingest-jobs", id, depth: 1, user });

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

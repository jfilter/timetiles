/**
 * API endpoint for updating a scheduled ingest's configuration.
 *
 * PATCH /api/ingest/update-schedule - Update an existing scheduled ingest
 *
 * Accepts the wizard state for an existing schedule and updates datasets
 * and the scheduled ingest record.
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import { apiRoute, ForbiddenError, NotFoundError, ValidationError } from "@/lib/api";
import { getOrCreateCatalog, processSheetMappings, translateSchemaMode } from "@/lib/ingest/configure-service";
import { cleanupPreview, loadPreviewMetadata } from "@/lib/ingest/preview-store";
import { validateRequest } from "@/lib/ingest/preview-validation";
import {
  authConfigSchema,
  fieldMappingsSchema,
  jsonApiConfigSchema,
  scheduleConfigSchema,
  sheetMappingsSchema,
  transformsSchema,
} from "@/lib/ingest/shared-schemas";
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createLogger, logError } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

const logger = createLogger("api-update-schedule");

const COLLECTION = "scheduled-ingests" as const;

const UpdateScheduleBodySchema = z.object({
  scheduledIngestId: z.number().int().positive(),
  previewId: z.uuid(),
  catalogId: z.union([z.number(), z.literal("new")]),
  newCatalogName: z.string().optional(),
  sheetMappings: sheetMappingsSchema,
  fieldMappings: fieldMappingsSchema,
  deduplicationStrategy: z.enum(["skip", "update", "version"]),
  geocodingEnabled: z.boolean(),
  transforms: transformsSchema,
  scheduleConfig: scheduleConfigSchema,
  authConfig: authConfigSchema,
  jsonApiConfig: jsonApiConfigSchema,
  triggerRun: z.boolean().optional(),
});

export const PATCH = apiRoute({
  auth: "required",
  site: "default",
  body: UpdateScheduleBodySchema,
  // eslint-disable-next-line sonarjs/max-lines-per-function, sonarjs/cognitive-complexity, complexity -- orchestration handler with sequential steps
  handler: async ({ body, req, user, payload }) => {
    // Verify the scheduled ingest exists and belongs to the user
    const existing = await payload.findByID({
      collection: COLLECTION,
      id: body.scheduledIngestId,
      depth: 0,
      req,
      disableErrors: true,
    });

    if (!existing) {
      throw new NotFoundError("scheduled ingest not found");
    }

    const ownerId = extractRelationId(existing.createdBy);
    if (ownerId !== user.id && user.role !== "admin") {
      throw new ForbiddenError("You do not have access to this scheduled ingest");
    }

    // Validate preview
    const previewMeta = loadPreviewMetadata(body.previewId);
    validateRequest(previewMeta, user);

    // Resolve catalog
    const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user);
    if (finalCatalogId === "forbidden") {
      throw new ForbiddenError("You do not have access to this catalog");
    }
    if (finalCatalogId === null) {
      throw new ValidationError("New catalog name is required");
    }

    // Process sheet mappings — creates/updates datasets with field mapping overrides
    const { datasetMappingEntries } = await processSheetMappings(
      payload,
      req,
      body.sheetMappings,
      body.fieldMappings,
      finalCatalogId,
      body.deduplicationStrategy,
      body.geocodingEnabled,
      body.transforms as Array<{ sheetIndex: number; transforms: IngestTransform[] }> | undefined
    );

    // Update dataset schema config based on schema mode
    const schemaConfig = translateSchemaMode(body.scheduleConfig.schemaMode);
    await Promise.all(
      datasetMappingEntries.map(async (entry) => {
        await payload.update({ collection: "datasets", id: entry.dataset, data: { schemaConfig }, req });
      })
    );

    // Build scheduled ingest update data
    const isSingleSheet = datasetMappingEntries.length === 1;
    const firstDatasetId = datasetMappingEntries[0]?.dataset;

    // Only treat jsonApiConfig as meaningful if it has a recordsPath or enabled pagination.
    // Zod's optional() can produce an empty object {} which is truthy but has no real config.
    const hasJsonApiConfig =
      body.jsonApiConfig != null &&
      (!!body.jsonApiConfig.recordsPath || body.jsonApiConfig.pagination?.enabled === true);

    // Always include advancedOptions to prevent Payload from filling the group with
    // defaults. When JSON API config is provided, set responseFormat to "json".
    // Otherwise, force responseFormat to "auto" to prevent Payload defaulting to "json".
    const advancedOptions = hasJsonApiConfig
      ? { ...existing.advancedOptions, responseFormat: "json" as const, jsonApiConfig: body.jsonApiConfig }
      : { ...existing.advancedOptions, responseFormat: "auto" as const };

    const updateData: Record<string, unknown> = {
      name: body.scheduleConfig.name,
      sourceUrl: previewMeta.sourceUrl ?? existing.sourceUrl,
      catalog: finalCatalogId,
      scheduleType: body.scheduleConfig.scheduleType,
      schemaMode: body.scheduleConfig.schemaMode,
      frequency: body.scheduleConfig.scheduleType === "frequency" ? body.scheduleConfig.frequency : undefined,
      cronExpression: body.scheduleConfig.scheduleType === "cron" ? body.scheduleConfig.cronExpression : undefined,
      dataset: isSingleSheet && firstDatasetId ? firstDatasetId : undefined,
      multiSheetConfig:
        !isSingleSheet && datasetMappingEntries.length > 0
          ? {
              enabled: true,
              sheets: datasetMappingEntries.map((entry) => ({
                sheetIdentifier: entry.sheetIdentifier,
                dataset: entry.dataset,
                skipIfMissing: false,
              })),
            }
          : undefined,
    };

    // Always include advancedOptions to prevent Payload from filling group defaults
    updateData.advancedOptions = advancedOptions;

    // Only update auth config if provided (otherwise keep existing encrypted values)
    if (body.authConfig) {
      updateData.authConfig = body.authConfig;
    }

    await payload.update({ collection: COLLECTION, id: body.scheduledIngestId, data: updateData, req });

    logger.info(
      { scheduledIngestId: body.scheduledIngestId, name: body.scheduleConfig.name },
      "Updated scheduled ingest from wizard"
    );

    // Optionally trigger a run. Route through triggerScheduledIngest — the same
    // path manual triggers, webhooks, and the scheduler use — so the FULL
    // scheduled-ingest WORKFLOW runs (url-fetch → dataset-detection → per-sheet
    // pipeline). Queueing the raw `url-fetch` task alone created the ingest file
    // but never ran detection (url-fetch sets skipIngestFileHooks; only the
    // workflow chains the next stages), so no events were produced even though the
    // schedule got marked "success"; with deferLifecycleUpdates unset it also
    // recorded a failure on every one of url-fetch's retries, burning the retry
    // budget. Best-effort: the schedule update already succeeded, so a failed or
    // already-running trigger must not fail the request.
    if (body.triggerRun) {
      const updatedSchedule = await payload.findByID({
        collection: COLLECTION,
        id: body.scheduledIngestId,
        depth: 0,
        req,
      });
      const previousStatus = updatedSchedule.lastStatus ?? null;
      try {
        await triggerScheduledIngest(payload, updatedSchedule, new Date(), { triggeredBy: "manual" });
        logger.info({ scheduledIngestId: body.scheduledIngestId }, "Triggered run after schedule update");
      } catch (error) {
        if (error instanceof Error && error.message.includes("already running")) {
          logger.info({ scheduledIngestId: body.scheduledIngestId }, "Schedule already running, skipping trigger");
        } else {
          // The atomic claim succeeded but queueing failed, leaving the record
          // stuck as "running" — revert so future triggers aren't blocked. The
          // schedule update itself succeeded, so we still return success.
          logError(error, "Failed to trigger run after schedule update", { scheduledIngestId: body.scheduledIngestId });
          await payload.update({
            collection: COLLECTION,
            id: body.scheduledIngestId,
            data: { lastStatus: previousStatus },
            overrideAccess: true,
          });
        }
      }
    }

    cleanupPreview(body.previewId);

    return { success: true, scheduledIngestId: body.scheduledIngestId };
  },
});

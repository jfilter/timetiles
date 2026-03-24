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
import {
  getOrCreateCatalog,
  processSheetMappings,
  rethrowQuotaError,
  translateSchemaMode,
} from "@/lib/ingest/configure-service";
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
import { createLogger, logError } from "@/lib/logger";
import type { IngestTransform } from "@/lib/types/ingest-transforms";
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
  // eslint-disable-next-line sonarjs/max-lines-per-function, sonarjs/cognitive-complexity -- orchestration handler with sequential steps
  handler: async ({ body, req, user, payload }) => {
    try {
      // Verify the scheduled ingest exists and belongs to the user
      const existing = await payload.findByID({ collection: COLLECTION, id: body.scheduledIngestId, depth: 0, req });

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

      // Only set advancedOptions if JSON API config is provided
      const advancedOptions = body.jsonApiConfig
        ? { ...existing.advancedOptions, responseFormat: "json" as const, jsonApiConfig: body.jsonApiConfig }
        : null;

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

      // Only set advancedOptions if we have JSON config; otherwise don't touch it
      if (advancedOptions) {
        updateData.advancedOptions = advancedOptions;
      }

      // Only update auth config if provided (otherwise keep existing encrypted values)
      if (body.authConfig) {
        updateData.authConfig = body.authConfig;
      }

      await payload.update({ collection: COLLECTION, id: body.scheduledIngestId, data: updateData, req });

      logger.info(
        { scheduledIngestId: body.scheduledIngestId, name: body.scheduleConfig.name },
        "Updated scheduled ingest from wizard"
      );

      // Optionally trigger a run using the same atomic claim pattern as the trigger endpoint
      if (body.triggerRun) {
        const updatedSchedule = await payload.findByID({
          collection: COLLECTION,
          id: body.scheduledIngestId,
          depth: 0,
          req,
        });
        const claimResult = await payload.update({
          collection: COLLECTION,
          where: { id: { equals: body.scheduledIngestId }, lastStatus: { not_equals: "running" } },
          data: { lastRun: new Date().toISOString(), lastStatus: "running" },
          overrideAccess: true,
        });

        if (claimResult.docs.length > 0) {
          try {
            await payload.jobs.queue({
              task: "url-fetch",
              input: {
                scheduledIngestId: body.scheduledIngestId,
                sourceUrl: updatedSchedule.sourceUrl,
                authConfig: updatedSchedule.authConfig,
                originalName: updatedSchedule.name,
                triggeredBy: "manual",
              },
            });
            logger.info({ scheduledIngestId: body.scheduledIngestId }, "Triggered run after schedule update");
          } catch (queueError) {
            // Revert status so the schedule doesn't get stuck as "running"
            logError(queueError, "Failed to queue job after schedule update, reverting status", {
              scheduledIngestId: body.scheduledIngestId,
            });
            await payload.update({
              collection: COLLECTION,
              where: { id: { equals: body.scheduledIngestId } },
              data: { lastStatus: "failed", lastError: "Failed to queue import job" },
              overrideAccess: true,
            });
          }
        } else {
          logger.info({ scheduledIngestId: body.scheduledIngestId }, "Schedule already running, skipping trigger");
        }
      }

      cleanupPreview(body.previewId);

      return { success: true, scheduledIngestId: body.scheduledIngestId };
    } catch (error) {
      return rethrowQuotaError(error);
    }
  },
});

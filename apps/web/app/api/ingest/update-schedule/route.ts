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
import path from "node:path";

import { commitTransaction, initTransaction, killTransaction, type PayloadRequest } from "payload";
import { z } from "zod";

import { apiRoute, ForbiddenError, NotFoundError, requireFeatureEnabled, ValidationError } from "@/lib/api";
import {
  applySchemaConfigToDatasets,
  buildSheetLinkFields,
  getOrCreateCatalog,
  processSheetMappings,
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
import { triggerScheduledIngest } from "@/lib/ingest/trigger-service";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createLogger, logError } from "@/lib/logger";
import { extractRelationId } from "@/lib/utils/relation-id";

import { parseFileSheets } from "../preview-schema/helpers";

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

    // Re-parse preview sheets so processSheetMappings can validate that every
    // user-supplied field path exists in the detected schema (mirrors the
    // create endpoint — otherwise stale/invalid paths persist silently).
    const fileExtension = path.extname(previewMeta.filePath).toLowerCase();
    let previewSheets;
    try {
      previewSheets = await parseFileSheets(previewMeta.filePath, fileExtension);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Unknown error";
      throw new ValidationError(`Failed to re-parse preview for validation: ${message}`);
    }

    // Dataset creation/updates and the scheduled-ingest update below must land
    // together — without a transaction, a failure partway through (e.g. the final
    // scheduled-ingest update) leaves datasets modified/orphaned while the API
    // reports failure, and a retry then operates on half-applied state.
    const txReq = req as unknown as PayloadRequest;
    txReq.payload = payload;
    txReq.context ??= {};
    const ownsTransaction = await initTransaction(txReq);

    let datasetMappingEntries;
    try {
      // Process sheet mappings — creates/updates datasets with field mapping overrides
      ({ datasetMappingEntries } = await processSheetMappings(
        payload,
        req,
        body.sheetMappings,
        body.fieldMappings,
        finalCatalogId,
        body.deduplicationStrategy,
        body.geocodingEnabled,
        body.transforms as Array<{ sheetIndex: number; transforms: IngestTransform[] }> | undefined,
        previewSheets
      ));

      // Update dataset schema config based on schema mode
      await applySchemaConfigToDatasets(payload, datasetMappingEntries, body.scheduleConfig.schemaMode, txReq);
    } catch (error) {
      if (ownsTransaction) await killTransaction(txReq);
      throw error;
    }

    // Build scheduled ingest update data
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
      : { ...existing.advancedOptions, responseFormat: "auto" as const, jsonApiConfig: null };

    const updateData: Record<string, unknown> = {
      name: body.scheduleConfig.name,
      sourceUrl: previewMeta.sourceUrl ?? existing.sourceUrl,
      catalog: finalCatalogId,
      scheduleType: body.scheduleConfig.scheduleType,
      schemaMode: body.scheduleConfig.schemaMode,
      frequency: body.scheduleConfig.scheduleType === "frequency" ? body.scheduleConfig.frequency : undefined,
      cronExpression: body.scheduleConfig.scheduleType === "cron" ? body.scheduleConfig.cronExpression : undefined,
      // "clear": sheet-mode fields being emptied need explicit null / a disabled
      // config — Payload treats undefined as "field omitted" and keeps the prior value.
      ...buildSheetLinkFields(datasetMappingEntries, "clear"),
    };

    // Always include advancedOptions to prevent Payload from filling group defaults
    updateData.advancedOptions = advancedOptions;

    // Only update auth config if provided (otherwise keep existing encrypted values)
    if (body.authConfig) {
      updateData.authConfig = body.authConfig;
    }

    try {
      // The collection's create access denies when the flag is off, but Payload
      // update access doesn't re-check it — enforce it here so a disabled flag
      // also blocks reconfiguring an existing schedule.
      await requireFeatureEnabled(payload, "enableScheduledIngests", "Scheduled imports are currently disabled.");

      await payload.update({ collection: COLLECTION, id: body.scheduledIngestId, data: updateData, req });
      if (ownsTransaction) await commitTransaction(txReq);
    } catch (error) {
      if (ownsTransaction) await killTransaction(txReq);
      throw error;
    }

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

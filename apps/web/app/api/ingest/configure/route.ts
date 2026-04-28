/**
 * API endpoint for configuring and starting an import.
 *
 * POST /api/ingest/configure - Configure import and start processing
 *
 * Takes the wizard configuration and starts the import process.
 *
 * @module
 * @category API Routes
 */
import path from "node:path";

import { apiRoute, ForbiddenError, ValidationError } from "@/lib/api";
import {
  createIngestFileRecord,
  createScheduledIngest,
  getOrCreateCatalog,
  processSheetMappings,
} from "@/lib/ingest/configure-service";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import { createLogger } from "@/lib/logger";

import { parseFileSheets } from "../preview-schema/helpers";
import {
  cleanupPreview,
  ConfigureImportBodySchema,
  type ConfigureIngestRequest,
  loadPreviewMetadata,
  validateRequest,
} from "./helpers";

const logger = createLogger("api-wizard-configure-import");

/**
 * Configure and start import.
 *
 * Takes the wizard configuration (previewId, catalog, datasets, field mappings)
 * and creates the import file record to start processing.
 */
export const POST = apiRoute({
  auth: "required",
  site: "default",
  rateLimit: { configName: "API_GENERAL", keyPrefix: (u) => `configure:${u!.id}` },
  body: ConfigureImportBodySchema,
  handler: async ({ body, req, user, payload }) => {
    logger.debug(
      {
        previewId: body.previewId,
        catalogId: body.catalogId,
        sheetMappingsCount: body.sheetMappings.length,
        geocodingEnabled: body.geocodingEnabled,
      },
      "Configure import request received"
    );

    const previewMeta = loadPreviewMetadata(body.previewId);

    // Validate business-logic constraints (preview exists, not expired, user owns it)
    validateRequest(previewMeta, user);

    // Get or create catalog
    logger.debug(
      { catalogId: body.catalogId, newCatalogName: body.newCatalogName, userId: user.id, userRole: user.role },
      "Resolving catalog for import"
    );
    const finalCatalogId = await getOrCreateCatalog(payload, req, body.catalogId, body.newCatalogName, user);
    if (finalCatalogId === "forbidden") {
      throw new ForbiddenError("You do not have access to this catalog");
    }
    if (finalCatalogId === null) {
      throw new ValidationError("New catalog name is required");
    }

    // Parse preview sheets so processSheetMappings can validate that every
    // user-supplied field path exists in the detected schema. Catch parse
    // failures and translate them into a user-friendly ValidationError.
    const fileExtension = path.extname(previewMeta.filePath).toLowerCase();
    let previewSheets;
    try {
      previewSheets = await parseFileSheets(previewMeta.filePath, fileExtension);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Unknown error";
      throw new ValidationError(`Failed to re-parse preview for validation: ${message}`);
    }

    let shouldCleanupPreview = false;
    try {
      // Process sheet mappings and create/update datasets
      const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
        payload,
        req,
        body.sheetMappings,
        body.fieldMappings,
        finalCatalogId,
        body.deduplicationStrategy,
        body.geocodingEnabled,
        body.transforms as Array<{ sheetIndex: number; transforms: IngestTransform[] }> | undefined,
        previewSheets
      );

      shouldCleanupPreview = true;

      // Create the import file record
      const ingestFile = await createIngestFileRecord(
        payload,
        user,
        previewMeta,
        body as ConfigureIngestRequest,
        finalCatalogId,
        datasetIdMap,
        datasetMappingEntries
      );

      // Create scheduled ingest if requested
      let scheduledIngestId: number | null = null;
      if (body.createSchedule?.enabled) {
        scheduledIngestId = await createScheduledIngest({
          payload,
          req,
          scheduleConfig: body.createSchedule,
          catalogId: finalCatalogId,
          datasetMappingEntries,
          user,
          ingestFileId: ingestFile.id,
          previewMeta,
        });
      }

      return {
        ingestFileId: ingestFile.id,
        catalogId: finalCatalogId,
        datasets: Object.fromEntries(datasetIdMap),
        scheduledIngestId: scheduledIngestId ?? undefined,
      };
    } finally {
      if (shouldCleanupPreview) cleanupPreview(body.previewId);
    }
  },
});

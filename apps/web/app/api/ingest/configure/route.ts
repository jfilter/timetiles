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
import { apiRoute, ForbiddenError, ValidationError } from "@/lib/api";
import {
  createIngestFileRecord,
  createScheduledIngest,
  getOrCreateCatalog,
  processSheetMappings,
  rethrowQuotaError,
} from "@/lib/ingest/configure-service";
import { createLogger } from "@/lib/logger";
import type { IngestTransform } from "@/lib/types/ingest-transforms";

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
  body: ConfigureImportBodySchema,
  handler: async ({ body, req, user, payload }) => {
    try {
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

      // Process sheet mappings and create/update datasets
      const { datasetIdMap, datasetMappingEntries } = await processSheetMappings(
        payload,
        req,
        body.sheetMappings,
        body.fieldMappings,
        finalCatalogId,
        body.deduplicationStrategy,
        body.geocodingEnabled,
        body.transforms as Array<{ sheetIndex: number; transforms: IngestTransform[] }> | undefined
      );

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
        scheduledIngestId = await createScheduledIngest(
          payload,
          body.createSchedule,
          finalCatalogId,
          datasetMappingEntries,
          user,
          ingestFile.id,
          previewMeta
        );
      }

      cleanupPreview(body.previewId);

      return {
        ingestFileId: ingestFile.id,
        catalogId: finalCatalogId,
        datasets: Object.fromEntries(datasetIdMap),
        scheduledIngestId: scheduledIngestId ?? undefined,
      };
    } catch (error) {
      // Bug 15: surface quota-exceeded as 429 rather than 500
      return rethrowQuotaError(error);
    }
  },
});

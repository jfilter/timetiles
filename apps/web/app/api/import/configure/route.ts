/**
 * API endpoint for configuring and starting an import.
 *
 * POST /api/import/configure - Configure import and start processing
 *
 * Takes the wizard configuration and starts the import process.
 *
 * @module
 * @category API Routes
 */
import { apiRoute, ForbiddenError, ValidationError } from "@/lib/api";
import {
  createImportFileRecord,
  createScheduledImport,
  getOrCreateCatalog,
  processSheetMappings,
  rethrowQuotaError,
} from "@/lib/import/configure-service";
import { createLogger } from "@/lib/logger";
import type { ImportTransform } from "@/lib/types/import-transforms";

import {
  cleanupPreview,
  ConfigureImportBodySchema,
  type ConfigureImportRequest,
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
      const validationError = validateRequest(previewMeta, user);
      if (validationError) {
        return validationError;
      }

      // Get or create catalog
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
        body.transforms as Array<{ sheetIndex: number; transforms: ImportTransform[] }> | undefined
      );

      // Create the import file record
      const importFile = await createImportFileRecord(
        payload,
        user,
        previewMeta!,
        body as ConfigureImportRequest,
        finalCatalogId,
        datasetIdMap,
        datasetMappingEntries
      );

      // Create scheduled import if requested
      let scheduledImportId: number | null = null;
      if (body.createSchedule?.enabled) {
        scheduledImportId = await createScheduledImport(
          payload,
          body.createSchedule,
          finalCatalogId,
          datasetMappingEntries,
          user,
          importFile.id,
          previewMeta!
        );
      }

      cleanupPreview(body.previewId);

      return {
        importFileId: importFile.id,
        catalogId: finalCatalogId,
        datasets: Object.fromEntries(datasetIdMap),
        scheduledImportId: scheduledImportId ?? undefined,
      };
    } catch (error) {
      // Bug 15: surface quota-exceeded as 429 rather than 500
      return rethrowQuotaError(error);
    }
  },
});

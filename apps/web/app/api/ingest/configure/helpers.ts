/**
 * Helper functions and types for the configure-import endpoint.
 *
 * Types are imported from the shared import wizard types module.
 * Preview storage operations are delegated to `@/lib/ingest/preview-store`.
 * Preview validation is delegated to `@/lib/ingest/preview-validation`.
 * This file contains the Zod validation schema for the configure-import request body.
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

import {
  authConfigSchema,
  fieldMappingsSchema,
  jsonApiConfigSchema,
  scheduleConfigSchema,
  sheetMappingsSchema,
  transformsSchema,
} from "@/lib/ingest/shared-schemas";

export { cleanupPreview, loadPreviewMetadata } from "@/lib/ingest/preview-store";
export { validateRequest } from "@/lib/ingest/preview-validation";
export type {
  AuthConfig,
  ConfigureIngestRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/lib/ingest/types/wizard";

/** Zod schema for validating the configure-import request body. */
export const ConfigureImportBodySchema = z.object({
  previewId: z.uuid(),
  catalogId: z.union([z.number(), z.literal("new")]),
  newCatalogName: z.string().optional(),
  sheetMappings: sheetMappingsSchema,
  fieldMappings: fieldMappingsSchema,
  deduplicationStrategy: z.enum(["skip", "update", "version"]),
  geocodingEnabled: z.boolean(),
  transforms: transformsSchema,
  createSchedule: scheduleConfigSchema
    .extend({
      enabled: z.boolean(),
      sourceUrl: z.string(),
      authConfig: authConfigSchema
        .unwrap()
        .extend({ customHeaders: z.union([z.string(), z.record(z.string(), z.string())]).optional() })
        .optional(),
      jsonApiConfig: jsonApiConfigSchema,
    })
    .optional(),
});

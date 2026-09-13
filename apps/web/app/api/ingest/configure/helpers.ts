/**
 * Zod validation schema for the configure-import request body.
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

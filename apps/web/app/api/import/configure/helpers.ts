/**
 * Helper functions and types for the configure-import endpoint.
 *
 * Types are imported from the shared import wizard types module.
 * Preview storage operations are delegated to `@/lib/import/preview-store`.
 * Preview validation is delegated to `@/lib/import/preview-validation`.
 * This file contains the Zod validation schema for the configure-import request body.
 *
 * @module
 * @category API Routes
 */
import { z } from "zod";

export { cleanupPreview, loadPreviewMetadata } from "@/lib/import/preview-store";
export { validateRequest } from "@/lib/import/preview-validation";
export type {
  AuthConfig,
  ConfigureImportRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/lib/types/import-wizard";

/** Zod schema for validating the configure-import request body. */
export const ConfigureImportBodySchema = z.object({
  previewId: z.uuid(),
  catalogId: z.union([z.number(), z.literal("new")]),
  newCatalogName: z.string().optional(),
  sheetMappings: z
    .array(
      z.object({
        sheetIndex: z.number().int().min(0),
        datasetId: z.union([z.number(), z.literal("new")]),
        newDatasetName: z.string(),
      })
    )
    .min(1),
  fieldMappings: z
    .array(
      z.object({
        sheetIndex: z.number().int().min(0),
        titleField: z.string().nullable(),
        descriptionField: z.string().nullable(),
        locationNameField: z.string().nullable().optional().default(null),
        dateField: z.string().nullable(),
        idField: z.string().nullable(),
        idStrategy: z.enum(["external", "computed", "auto", "hybrid"]),
        locationField: z.string().nullable(),
        latitudeField: z.string().nullable(),
        longitudeField: z.string().nullable(),
      })
    )
    .min(1),
  deduplicationStrategy: z.enum(["skip", "update", "version"]),
  geocodingEnabled: z.boolean(),
  transforms: z
    .array(
      z.object({
        sheetIndex: z.number().int().min(0),
        transforms: z.array(
          z.object({
            id: z.string(),
            type: z.enum(["rename", "date-parse", "string-op", "concatenate", "split"]),
            active: z.boolean(),
            autoDetected: z.boolean(),
            from: z.string().optional(),
            to: z.string().optional(),
            inputFormat: z.string().optional(),
            outputFormat: z.string().optional(),
            timezone: z.string().optional(),
            operation: z.enum(["uppercase", "lowercase", "trim", "replace", "expression"]).optional(),
            pattern: z.string().optional(),
            replacement: z.string().optional(),
            expression: z.string().optional(),
            fromFields: z.array(z.string()).optional(),
            separator: z.string().optional(),
            delimiter: z.string().optional(),
            toFields: z.array(z.string()).optional(),
          })
        ),
      })
    )
    .optional(),
  createSchedule: z
    .object({
      enabled: z.boolean(),
      sourceUrl: z.string(),
      name: z.string(),
      scheduleType: z.enum(["frequency", "cron"]),
      frequency: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
      cronExpression: z.string().optional(),
      schemaMode: z.enum(["strict", "additive", "flexible"]),
      authConfig: z
        .object({
          type: z.enum(["none", "api-key", "bearer", "basic"]),
          apiKey: z.string().optional(),
          apiKeyHeader: z.string().optional(),
          bearerToken: z.string().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          customHeaders: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
        })
        .optional(),
    })
    .optional(),
});

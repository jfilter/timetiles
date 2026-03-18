/**
 * Helper functions and types for the configure-import endpoint.
 *
 * Types are imported from the shared import wizard types module.
 * Preview storage operations are delegated to `@/lib/import/preview-store`.
 * This file contains route-specific utilities: Zod validation schema
 * and business-logic request validation.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";

import { z } from "zod";

import type { PreviewMetadata } from "@/lib/types/import-wizard";
import { badRequest, unauthorized } from "@/lib/utils/api-response";
import type { User } from "@/payload-types";

export { cleanupPreview, loadPreviewMetadata } from "@/lib/import/preview-store";
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
            type: z.enum(["rename", "date-parse", "string-op", "concatenate", "split", "type-cast"]),
            active: z.boolean(),
            autoDetected: z.boolean(),
            from: z.string().optional(),
            to: z.string().optional(),
            inputFormat: z.string().optional(),
            outputFormat: z.string().optional(),
            timezone: z.string().optional(),
            operation: z.enum(["uppercase", "lowercase", "trim", "replace"]).optional(),
            pattern: z.string().optional(),
            replacement: z.string().optional(),
            fromFields: z.array(z.string()).optional(),
            separator: z.string().optional(),
            delimiter: z.string().optional(),
            toFields: z.array(z.string()).optional(),
            fromType: z.enum(["string", "number", "boolean", "date", "array", "object", "null"]).optional(),
            toType: z.enum(["string", "number", "boolean", "date", "array", "object", "null"]).optional(),
            strategy: z.enum(["parse", "cast", "custom", "reject"]).optional(),
            customFunction: z.string().optional(),
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

/**
 * Validate business-logic constraints that Zod cannot check.
 *
 * Shape validation (required fields, types, non-empty arrays) is handled
 * by {@link ConfigureImportBodySchema}. This function checks that the preview
 * exists on disk, is not expired, and belongs to the requesting user.
 */
export const validateRequest = (previewMeta: PreviewMetadata | null, user: User): Response | null => {
  if (!previewMeta) {
    return badRequest("Preview not found or expired. Please upload the file again.");
  }

  // Bug 27 fix: reject expired previews
  if (previewMeta.expiresAt && new Date(previewMeta.expiresAt) < new Date()) {
    return badRequest("Preview has expired. Please upload the file again.");
  }

  if (previewMeta.userId !== user.id) {
    return unauthorized("You do not have access to this preview");
  }

  if (!fs.existsSync(previewMeta.filePath)) {
    return badRequest("Preview file not found. Please upload the file again.");
  }

  return null;
};

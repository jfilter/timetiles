/**
 * Shared Zod schemas for ingest API routes.
 *
 * These schemas define the common request body shapes shared between
 * the configure (create) and update-schedule (edit) endpoints.
 *
 * @module
 * @category API
 */
import { z } from "zod";

import { STRING_OPERATIONS, TRANSFORM_TYPES } from "@/lib/definitions/transform-registry";

/** Zod schema for sheet mappings (shared between create and update). */
export const sheetMappingsSchema = z
  .array(
    z.object({
      sheetIndex: z.number().int().min(0),
      datasetId: z.union([z.number(), z.literal("new")]),
      newDatasetName: z.string(),
    })
  )
  .min(1);

/** Zod schema for field mappings (shared between create and update). */
export const fieldMappingsSchema = z
  .array(
    z.object({
      sheetIndex: z.number().int().min(0),
      titleField: z.string().nullable(),
      descriptionField: z.string().nullable(),
      locationNameField: z.string().nullable().optional().default(null),
      dateField: z.string().nullable(),
      endDateField: z.string().nullable().optional().default(null),
      idField: z.string().nullable(),
      idStrategy: z.enum(["external", "content-hash", "auto-generate"]),
      locationField: z.string().nullable(),
      latitudeField: z.string().nullable(),
      longitudeField: z.string().nullable(),
    })
  )
  .min(1);

/** Zod schema for a single transform rule. */
export const transformRuleSchema = z.object({
  id: z.string(),
  type: z.enum(TRANSFORM_TYPES),
  active: z.boolean(),
  autoDetected: z.boolean(),
  from: z.string().optional(),
  to: z.string().optional(),
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  timezone: z.string().optional(),
  operation: z.enum(STRING_OPERATIONS).optional(),
  pattern: z.string().optional(),
  replacement: z.string().optional(),
  expression: z.string().optional(),
  fromFields: z.array(z.string()).optional(),
  separator: z.string().optional(),
  delimiter: z.string().optional(),
  toFields: z.array(z.string()).optional(),
});

/** Zod schema for per-sheet transforms array (shared between create and update). */
export const transformsSchema = z
  .array(z.object({ sheetIndex: z.number().int().min(0), transforms: z.array(transformRuleSchema) }))
  .optional();

/** Zod schema for auth configuration (shared between create and update). */
export const authConfigSchema = z
  .object({
    type: z.enum(["none", "api-key", "bearer", "basic"]),
    apiKey: z.string().optional(),
    apiKeyHeader: z.string().optional(),
    bearerToken: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .optional();

/** Zod schema for JSON API pagination configuration. */
export const jsonApiPaginationSchema = z
  .object({
    enabled: z.boolean(),
    type: z.enum(["offset", "cursor", "page"]).optional(),
    pageParam: z.string().optional(),
    limitParam: z.string().optional(),
    limitValue: z.number().min(1).max(10000).optional(),
    cursorParam: z.string().optional(),
    nextCursorPath: z.string().optional(),
    totalPath: z.string().optional(),
    maxPages: z.number().min(1).max(500).optional(),
  })
  .optional();

/** Zod schema for JSON API configuration (shared between create and update). */
export const jsonApiConfigSchema = z
  .object({ recordsPath: z.string().optional(), pagination: jsonApiPaginationSchema })
  .optional();

/** Zod schema for schedule configuration fields. */
export const scheduleConfigSchema = z.object({
  name: z.string().min(1),
  scheduleType: z.enum(["frequency", "cron"]),
  frequency: z.enum(["hourly", "daily", "weekly", "monthly"]).optional(),
  cronExpression: z.string().optional(),
  schemaMode: z.enum(["strict", "additive", "flexible"]),
});

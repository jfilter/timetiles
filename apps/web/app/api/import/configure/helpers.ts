/**
 * Helper functions and types for the configure-import endpoint.
 *
 * Types are imported from the shared import wizard types module.
 * This file contains route-specific utilities: Zod validation schema,
 * preview metadata I/O, and request validation.
 *
 * @module
 * @category API Routes
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import type { PreviewMetadata } from "@/lib/types/import-wizard";
import { badRequest, unauthorized } from "@/lib/utils/api-response";
import type { User } from "@/payload-types";

export type {
  AuthConfig,
  ConfigureImportRequest,
  CreateScheduleConfig,
  DatasetMappingEntry,
  FieldMapping,
  PreviewMetadata,
  SheetMapping,
} from "@/lib/types/import-wizard";

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUUID = (id: string): boolean => UUID_REGEX.test(id);

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

// Helper functions
const getPreviewDir = (): string => {
  return path.join(os.tmpdir(), "timetiles-wizard-preview");
};

export const loadPreviewMetadata = (previewId: string): PreviewMetadata | null => {
  // Security: Validate previewId is a valid UUID to prevent path traversal
  if (!isValidUUID(previewId)) {
    return null;
  }

  const previewDir = getPreviewDir();
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metaPath, "utf-8");
    return JSON.parse(content) as PreviewMetadata;
  } catch {
    return null;
  }
};

/** Known data file extensions that the preview may have created. */
const DATA_FILE_EXTENSIONS = [".csv", ".xls", ".xlsx", ".ods"];

export const cleanupPreview = (previewId: string) => {
  // Security: previewId is already validated as a UUID before this is called
  const previewDir = getPreviewDir();

  // Remove the metadata file
  const metaPath = path.join(previewDir, `${previewId}.meta.json`);
  if (fs.existsSync(metaPath)) {
    fs.unlinkSync(metaPath);
  }

  // Remove any associated data files (Bug 26 fix: previously only meta was cleaned up)
  for (const ext of DATA_FILE_EXTENSIONS) {
    const dataPath = path.join(previewDir, `${previewId}${ext}`);
    if (fs.existsSync(dataPath)) {
      fs.unlinkSync(dataPath);
    }
  }
};

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

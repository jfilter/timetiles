/**
 * Canonical domain types for the import wizard.
 *
 * All import wizard types are defined here as the single source of truth.
 * Other modules (API routes, UI components, services) import from this file
 * instead of defining their own copies.
 *
 * @module
 * @category Types
 */

import type { LanguageResult } from "@/lib/services/schema-detection";

import type { ImportTransform } from "./import-transforms";

export type { ImportTransform } from "./import-transforms";
export type { LanguageResult } from "@/lib/services/schema-detection";

/** Confidence level for a field mapping suggestion */
export type ConfidenceLevel = "high" | "medium" | "low" | "none";

/** A field mapping suggestion with confidence information */
export interface FieldMappingSuggestion {
  path: string | null;
  confidence: number;
  confidenceLevel: ConfidenceLevel;
}

/** Suggested field mappings from auto-detection */
export interface SuggestedMappings {
  language: LanguageResult;
  mappings: {
    titlePath: FieldMappingSuggestion;
    descriptionPath: FieldMappingSuggestion;
    locationNamePath: FieldMappingSuggestion;
    timestampPath: FieldMappingSuggestion;
    latitudePath: FieldMappingSuggestion;
    longitudePath: FieldMappingSuggestion;
    locationPath: FieldMappingSuggestion;
  };
}

/** Information about a single sheet from a preview file */
export interface SheetInfo {
  index: number;
  name: string;
  rowCount: number;
  headers: string[];
  sampleData: Record<string, unknown>[];
  suggestedMappings?: SuggestedMappings;
}

/** Auth configuration for imports (matches ScheduledImport authConfig structure) */
export interface AuthConfig {
  type: "none" | "api-key" | "bearer" | "basic";
  apiKey?: string;
  apiKeyHeader?: string;
  bearerToken?: string;
  username?: string;
  password?: string;
  customHeaders?: string | Record<string, string>;
}

/** Narrowed auth config for URL imports (UI does not expose customHeaders) */
export type UrlAuthConfig = Omit<AuthConfig, "customHeaders">;

/** Mapping of a file sheet to a dataset */
export interface SheetMapping {
  sheetIndex: number;
  datasetId: number | "new";
  newDatasetName: string;
  /** UI-only: similarity score for dataset matching (not sent to API) */
  similarityScore?: number | null;
}

/** Mapping of file columns to event fields */
export interface FieldMapping {
  sheetIndex: number;
  titleField: string | null;
  descriptionField: string | null;
  locationNameField: string | null;
  dateField: string | null;
  idField: string | null;
  idStrategy: "external" | "computed" | "auto" | "hybrid";
  locationField: string | null;
  latitudeField: string | null;
  longitudeField: string | null;
}

/** Keys of FieldMapping that hold `string | null` column names (excludes sheetIndex and idStrategy). */
export type FieldMappingStringField = {
  [K in keyof FieldMapping]: [FieldMapping[K]] extends [string | null]
    ? [string | null] extends [FieldMapping[K]]
      ? K
      : never
    : never;
}[keyof FieldMapping];

/**
 * Check if a field mapping has all required fields filled in.
 *
 * Requires title, date, and either a location field or both lat/lng fields.
 */
export const isFieldMappingComplete = (mapping: FieldMapping | undefined): boolean => {
  if (!mapping) return false;
  return (
    !!mapping.titleField &&
    !!mapping.dateField &&
    (!!mapping.locationField || (!!mapping.latitudeField && !!mapping.longitudeField))
  );
};

/** Schedule creation configuration */
export interface CreateScheduleConfig {
  enabled: boolean;
  sourceUrl: string;
  name: string;
  scheduleType: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode: "strict" | "additive" | "flexible";
  authConfig?: AuthConfig;
}

/** Full request body for the configure-import endpoint */
export interface ConfigureImportRequest {
  previewId: string;
  catalogId: number | "new";
  newCatalogName?: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: "skip" | "update" | "version";
  geocodingEnabled: boolean;
  createSchedule?: CreateScheduleConfig;
  transforms?: Array<{ sheetIndex: number; transforms: ImportTransform[] }>;
}

/** Entry in the dataset mapping metadata for import jobs */
export interface DatasetMappingEntry {
  sheetIdentifier: string;
  dataset: number;
  skipIfMissing: boolean;
}

/** Preview metadata persisted to disk during the wizard flow */
export interface PreviewMetadata {
  previewId: string;
  userId: number;
  originalName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  expiresAt: string;
  sourceUrl?: string;
  authConfig?: AuthConfig;
}

/** Config from an existing dataset suggested for reuse */
export interface ConfigSuggestion {
  datasetId: number;
  datasetName: string;
  catalogId: number;
  catalogName: string;
  score: number;
  matchedColumns: string[];
  config: {
    fieldMappingOverrides: {
      titlePath?: string | null;
      descriptionPath?: string | null;
      locationNamePath?: string | null;
      timestampPath?: string | null;
      latitudePath?: string | null;
      longitudePath?: string | null;
      locationPath?: string | null;
    };
    importTransforms?: unknown[];
    idStrategy?: { type?: string; externalIdPath?: string | null; duplicateStrategy?: string | null };
    deduplicationConfig?: { strategy?: string | null };
    geocodingEnabled?: boolean;
  };
}

// ---------------------------------------------------------------------------
// API request/response types for import wizard endpoints
// ---------------------------------------------------------------------------

/** Response from POST /api/import/preview-schema/upload */
export interface PreviewSchemaUploadResponse {
  sheets: SheetInfo[];
  previewId: string;
  configSuggestions?: ConfigSuggestion[];
}

/** Request body for POST /api/import/preview-schema/url */
export interface PreviewSchemaUrlRequest {
  sourceUrl: string;
  authConfig?: UrlAuthConfig;
}

/** Response from POST /api/import/preview-schema/url */
export interface PreviewSchemaUrlResponse {
  sheets: SheetInfo[];
  previewId: string;
  sourceUrl: string;
  fileName: string;
  contentLength: number;
  contentType: string;
  configSuggestions?: ConfigSuggestion[];
}

/** Response from POST /api/import/configure */
export interface ImportConfigureResponse {
  importFileId: number;
  scheduledImportId?: number;
}

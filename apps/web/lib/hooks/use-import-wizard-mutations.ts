/**
 * React Query mutation hooks for import wizard API calls.
 *
 * Extracts fetch logic from wizard step components into reusable
 * mutation hooks following the project convention.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation } from "@tanstack/react-query";

import type {
  FieldMapping,
  SheetInfo,
  SheetMapping,
  UrlAuthConfig,
} from "@/app/(frontend)/import/_components/wizard-context";

import { fetchJson } from "../api/http-error";

interface PreviewSchemaUploadResponse {
  sheets: SheetInfo[];
  previewId: string;
}

interface PreviewSchemaUrlRequest {
  sourceUrl: string;
  authConfig?: UrlAuthConfig;
}

interface PreviewSchemaUrlResponse {
  sheets: SheetInfo[];
  previewId: string;
  fileName?: string;
  contentLength?: number;
  contentType?: string;
}

interface ImportConfigureRequest {
  previewId: string;
  catalogId: number | "new" | null;
  newCatalogName?: string;
  sheetMappings: SheetMapping[];
  fieldMappings: FieldMapping[];
  deduplicationStrategy: string;
  geocodingEnabled: boolean;
  createSchedule?: {
    enabled: boolean;
    sourceUrl: string;
    name: string;
    scheduleType: "frequency" | "cron";
    frequency?: string;
    cronExpression?: string;
    schemaMode: string;
    authConfig?: UrlAuthConfig;
  };
}

interface ImportConfigureResponse {
  importFileId: number;
  scheduledImportId?: number;
}

const previewSchemaUpload = async (formData: FormData): Promise<PreviewSchemaUploadResponse> => {
  return fetchJson<PreviewSchemaUploadResponse>("/api/import/preview-schema/upload", {
    method: "POST",
    body: formData,
  });
};

const previewSchemaUrl = async (request: PreviewSchemaUrlRequest): Promise<PreviewSchemaUrlResponse> => {
  return fetchJson<PreviewSchemaUrlResponse>("/api/import/preview-schema/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
};

const importConfigure = async (request: ImportConfigureRequest): Promise<ImportConfigureResponse> => {
  return fetchJson<ImportConfigureResponse>("/api/import/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
};

/**
 * Mutation hook for uploading a file to preview its schema.
 */
export const usePreviewSchemaUploadMutation = () => {
  return useMutation({ mutationFn: previewSchemaUpload });
};

/**
 * Mutation hook for fetching a URL to preview its schema.
 */
export const usePreviewSchemaUrlMutation = () => {
  return useMutation({ mutationFn: previewSchemaUrl });
};

/**
 * Mutation hook for configuring and starting an import.
 */
export const useImportConfigureMutation = () => {
  return useMutation({ mutationFn: importConfigure });
};

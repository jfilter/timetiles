/**
 * React Query mutation hooks for import wizard API calls.
 *
 * Extracts fetch logic from wizard step components into reusable
 * mutation hooks following the project convention. All request/response
 * types are imported from the canonical `import-wizard` types module.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import type {
  ConfigureImportRequest,
  ImportConfigureResponse,
  PreviewSchemaUploadResponse,
  PreviewSchemaUrlRequest,
  PreviewSchemaUrlResponse,
  SheetInfo,
} from "@/lib/types/import-wizard";

import { fetchJson } from "../api/http-error";

export const previewSchemaUpload = async (formData: FormData): Promise<PreviewSchemaUploadResponse> => {
  return fetchJson<PreviewSchemaUploadResponse>("/api/import/preview-schema/upload", {
    method: "POST",
    body: formData,
  });
};

export const previewSchemaUrl = async (request: PreviewSchemaUrlRequest): Promise<PreviewSchemaUrlResponse> => {
  return fetchJson<PreviewSchemaUrlResponse>("/api/import/preview-schema/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
};

export const importConfigure = async (request: ConfigureImportRequest): Promise<ImportConfigureResponse> => {
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

/**
 * Query hook for loading preview sheet data by previewId.
 * Used by the flow editor to load preview data for visual field mapping.
 */
export const usePreviewSheetsQuery = (previewId: string | null) => {
  return useQuery({
    queryKey: ["preview-sheets", previewId],
    queryFn: () => fetchJson<{ sheets: SheetInfo[] }>(`/api/import/preview-schema?previewId=${previewId}`),
    enabled: !!previewId,
  });
};

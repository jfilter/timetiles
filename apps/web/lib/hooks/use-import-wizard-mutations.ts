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

import { HttpError } from "../api/http-error";

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
  const response = await fetch("/api/import/preview-schema/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = (body as { error?: string })?.error ?? "Failed to process file";
    throw new HttpError(response.status, message, body);
  }

  return response.json() as Promise<PreviewSchemaUploadResponse>;
};

const previewSchemaUrl = async (request: PreviewSchemaUrlRequest): Promise<PreviewSchemaUrlResponse> => {
  const response = await fetch("/api/import/preview-schema/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = (body as { error?: string })?.error ?? "Failed to fetch URL";
    throw new HttpError(response.status, message, body);
  }

  return response.json() as Promise<PreviewSchemaUrlResponse>;
};

const importConfigure = async (request: ImportConfigureRequest): Promise<ImportConfigureResponse> => {
  const response = await fetch("/api/import/configure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const message = (body as { error?: string })?.error ?? "Failed to start import";
    throw new HttpError(response.status, message, body);
  }

  return response.json() as Promise<ImportConfigureResponse>;
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

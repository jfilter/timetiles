/**
 * React Query mutation hooks for ingest wizard API calls.
 *
 * Extracts fetch logic from wizard step components into reusable
 * mutation hooks following the project convention. All request/response
 * types are imported from the canonical `ingest-wizard` types module.
 * Query hooks live in `use-ingest-wizard-queries.ts`.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ConfigureIngestRequest,
  IngestConfigureResponse,
  PreviewSchemaUploadResponse,
  PreviewSchemaUrlRequest,
  PreviewSchemaUrlResponse,
} from "@/lib/ingest/types/wizard";

import { fetchJson } from "../api/http-error";
import { catalogsQueryKeys } from "./use-catalogs-query";
import { dataSourcesKeys } from "./use-data-sources-query";
import { ingestFileKeys } from "./use-ingest-files-query";
import { scheduledIngestKeys } from "./use-scheduled-ingest-mutations";

export const previewSchemaUpload = async (formData: FormData): Promise<PreviewSchemaUploadResponse> => {
  return fetchJson<PreviewSchemaUploadResponse>("/api/ingest/preview-schema/upload", {
    method: "POST",
    body: formData,
  });
};

export const previewSchemaUrl = async (request: PreviewSchemaUrlRequest): Promise<PreviewSchemaUrlResponse> => {
  return fetchJson<PreviewSchemaUrlResponse>("/api/ingest/preview-schema/url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
};

export const ingestConfigure = async (request: ConfigureIngestRequest): Promise<IngestConfigureResponse> => {
  return fetchJson<IngestConfigureResponse>("/api/ingest/configure", {
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

/** Query groups an ingest configuration writes to: catalogs, datasets, the import and its schedule. */
const INGEST_CONFIGURE_AFFECTED_KEYS = [
  catalogsQueryKeys.all,
  dataSourcesKeys.all,
  ingestFileKeys.all,
  scheduledIngestKeys.all,
] as const;

/**
 * Mutation hook for configuring and starting an ingest.
 */
export const useIngestConfigureMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ingestConfigure,
    onSuccess: () => {
      for (const queryKey of INGEST_CONFIGURE_AFFECTED_KEYS) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });
};

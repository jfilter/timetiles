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

import { useMutation } from "@tanstack/react-query";

import type {
  ConfigureIngestRequest,
  IngestConfigureResponse,
  PreviewSchemaUploadResponse,
  PreviewSchemaUrlRequest,
  PreviewSchemaUrlResponse,
} from "@/lib/ingest/types/wizard";

import { fetchJson } from "../api/http-error";

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

/**
 * Mutation hook for configuring and starting an ingest.
 */
export const useIngestConfigureMutation = () => {
  return useMutation({ mutationFn: ingestConfigure });
};

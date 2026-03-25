/**
 * React Query hook for validating that a preview file still exists.
 *
 * Used by the import wizard context to detect stale previews.
 *
 * @module
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";
import { QUERY_PRESETS } from "./query-presets";

interface PreviewValidationResponse {
  valid: boolean;
}

const fetchPreviewValidation = (previewId: string) =>
  fetchJson<PreviewValidationResponse>(`/api/ingest/validate-preview?previewId=${previewId}`);

export const previewValidationQueryKeys = {
  all: ["preview-validation"] as const,
  byId: (previewId: string) => [...previewValidationQueryKeys.all, previewId] as const,
};

export const usePreviewValidationQuery = (previewId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: previewValidationQueryKeys.byId(previewId ?? ""),
    queryFn: () => fetchPreviewValidation(previewId ?? ""),
    enabled: enabled && previewId != null,
    ...QUERY_PRESETS.frequent,
  });

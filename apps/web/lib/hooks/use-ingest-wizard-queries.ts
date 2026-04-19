/**
 * React Query hooks for import wizard queries.
 *
 * Separated from mutation hooks to enforce clear module boundaries.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { SheetInfo } from "@/lib/ingest/types/wizard";

import { fetchJson } from "../api/http-error";
import { QUERY_PRESETS } from "./query-presets";

export const previewSheetsKeys = {
  all: ["preview-sheets"] as const,
  byPreview: (previewId: string | null) => [...previewSheetsKeys.all, previewId] as const,
};

/**
 * Query hook for loading preview sheet data by previewId.
 * Used by the flow editor to load preview data for visual field mapping.
 */
export const usePreviewSheetsQuery = (previewId: string | null) => {
  return useQuery({
    queryKey: previewSheetsKeys.byPreview(previewId),
    queryFn: () => fetchJson<{ sheets: SheetInfo[] }>(`/api/ingest/preview-schema?previewId=${previewId}`),
    enabled: !!previewId,
    ...QUERY_PRESETS.standard,
  });
};

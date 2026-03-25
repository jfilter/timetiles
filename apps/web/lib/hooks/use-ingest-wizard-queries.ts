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

import type { SheetInfo } from "@/lib/types/ingest-wizard";

import { fetchJson } from "../api/http-error";
import { QUERY_PRESETS } from "./query-presets";

/**
 * Query hook for loading preview sheet data by previewId.
 * Used by the flow editor to load preview data for visual field mapping.
 */
export const usePreviewSheetsQuery = (previewId: string | null) => {
  return useQuery({
    queryKey: ["preview-sheets", previewId],
    queryFn: () => fetchJson<{ sheets: SheetInfo[] }>(`/api/ingest/preview-schema?previewId=${previewId}`),
    enabled: !!previewId,
    ...QUERY_PRESETS.standard,
  });
};

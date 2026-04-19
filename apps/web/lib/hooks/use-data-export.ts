/**
 * React Query hooks for data export functionality.
 *
 * Provides hooks for requesting data exports, checking status, and downloading.
 *
 * @module
 * @category Hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ExportSummary } from "@/lib/export/types";
import type { DataExport as PayloadDataExport } from "@/payload-types";

import { fetchJson } from "../api/http-error";
import type { DataExport, ExportListResponse, RequestExportResponse } from "../types/data-export-api";
import { createItemPollingInterval, QUERY_PRESETS } from "./query-presets";

export type {
  DataExport,
  ExportListResponse,
  RequestExportError,
  RequestExportResponse,
} from "../types/data-export-api";

/**
 * Query key for data exports.
 */
export const dataExportQueryKeys = {
  all: ["data-exports"] as const,
  list: () => [...dataExportQueryKeys.all, "list"] as const,
  latest: () => [...dataExportQueryKeys.all, "latest"] as const,
};

/** Shape returned by the Payload REST API for the data-exports collection. */
interface PayloadDataExportsResponse {
  docs: PayloadDataExport[];
  totalDocs: number;
}

/**
 * Fetch the user's data exports.
 */
const fetchDataExports = async (): Promise<ExportListResponse> => {
  const data = await fetchJson<PayloadDataExportsResponse>("/api/data-exports?sort=-requestedAt&limit=10");

  // Transform Payload REST response to match expected format
  return {
    exports: data.docs.map(
      (exp): DataExport => ({
        id: exp.id,
        status: exp.status,
        requestedAt: exp.requestedAt,
        completedAt: exp.completedAt,
        expiresAt: exp.expiresAt,
        fileSize: exp.fileSize,
        downloadCount: exp.downloadCount,
        summary: (exp.summary as ExportSummary | null | undefined) ?? undefined,
        errorLog: exp.status === "failed" ? (exp.errorLog ?? undefined) : undefined,
      })
    ),
    total: data.totalDocs,
  };
};

/**
 * Request a new data export.
 */
const requestDataExport = async (): Promise<RequestExportResponse> => {
  return fetchJson<RequestExportResponse>("/api/data-exports/request", { method: "POST" });
};

const hasPendingExports = (data: ExportListResponse) =>
  data.exports?.some((exp) => exp.status === "pending" || exp.status === "processing") ?? false;

/**
 * Hook to fetch the user's data exports.
 */
export const useDataExportsQuery = () => {
  return useQuery({
    queryKey: dataExportQueryKeys.list(),
    queryFn: fetchDataExports,
    ...QUERY_PRESETS.frequent,
    refetchInterval: createItemPollingInterval(hasPendingExports, 5000),
  });
};

/**
 * Hook to get the most recent/relevant export.
 */
export const useLatestExportQuery = () => {
  const query = useDataExportsQuery();

  // Find the most relevant export (pending/processing first, then ready)
  const latestExport =
    query.data?.exports?.find(
      (exp) => exp.status === "pending" || exp.status === "processing" || exp.status === "ready"
    ) ?? query.data?.exports?.[0];

  return { ...query, latestExport };
};

/**
 * Hook to request a new data export.
 */
export const useRequestDataExportMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: requestDataExport,
    onSuccess: () => {
      // Invalidate the exports query to trigger a refetch
      void queryClient.invalidateQueries({ queryKey: dataExportQueryKeys.all });
    },
  });
};

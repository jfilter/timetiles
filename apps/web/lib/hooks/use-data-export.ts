/**
 * React Query hooks for data export functionality.
 *
 * Provides hooks for requesting data exports, checking status, and downloading.
 *
 * @module
 * @category Hooks
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "../api/http-error";
import type { DataExport, ExportListResponse, RequestExportResponse } from "../types/data-export-api";

export type {
  DataExport,
  ExportListResponse,
  RequestExportError,
  RequestExportResponse,
} from "../types/data-export-api";

/**
 * Query key for data exports.
 */
export const dataExportKeys = {
  all: ["data-exports"] as const,
  list: () => [...dataExportKeys.all, "list"] as const,
  latest: () => [...dataExportKeys.all, "latest"] as const,
};

/** Shape returned by the Payload REST API for the data-exports collection. */
interface PayloadDataExportsResponse {
  docs: DataExport[];
  totalDocs: number;
}

/**
 * Fetch the user's data exports.
 */
const fetchDataExports = async (): Promise<ExportListResponse> => {
  const data = await fetchJson<PayloadDataExportsResponse>("/api/data-exports?sort=-requestedAt&limit=10");

  // Transform Payload REST response to match expected format
  return {
    exports: data.docs.map((exp) => ({
      id: exp.id,
      status: exp.status,
      requestedAt: exp.requestedAt,
      completedAt: exp.completedAt,
      expiresAt: exp.expiresAt,
      fileSize: exp.fileSize,
      downloadCount: exp.downloadCount,
      summary: exp.summary,
      errorLog: exp.status === "failed" ? exp.errorLog : undefined,
    })),
    total: data.totalDocs,
  };
};

/**
 * Request a new data export.
 */
const requestDataExport = async (): Promise<RequestExportResponse> => {
  return fetchJson<RequestExportResponse>("/api/data-exports/request", { method: "POST" });
};

// Returns polling interval or false to stop - React Query expects this pattern
// eslint-disable-next-line sonarjs/function-return-type
const getExportPollingInterval = (query: { state: { data?: ExportListResponse } }): number | false => {
  const data = query.state.data;
  const hasPending = data?.exports?.some((exp) => exp.status === "pending" || exp.status === "processing");
  if (hasPending) {
    return 5000;
  }
  return false;
};

/**
 * Hook to fetch the user's data exports.
 */
export const useDataExportsQuery = () => {
  return useQuery({
    queryKey: dataExportKeys.list(),
    queryFn: fetchDataExports,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: (query) => getExportPollingInterval(query),
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
      void queryClient.invalidateQueries({ queryKey: dataExportKeys.all });
    },
  });
};

export { formatExportDate, getExportDownloadUrl, getTimeUntilExpiry } from "../utils/data-export";
export { formatFileSize } from "../utils/format";

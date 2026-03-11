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
import { formatDate, parseDateInput } from "../utils/date";

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

/**
 * Get download URL for an export.
 */
export const getExportDownloadUrl = (exportId: number): string => {
  return `/api/data-exports/${exportId}/download`;
};

/**
 * Format file size in human-readable format.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "Unknown size";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

/**
 * Format date in a user-friendly way.
 */
export const formatExportDate = (dateString: string | null | undefined): string => {
  if (!dateString) return "Unknown";

  const formattedDate = formatDate(dateString);
  return formattedDate === "N/A" ? "Unknown" : formattedDate;
};

/**
 * Calculate time remaining until expiry.
 */
export const getTimeUntilExpiry = (expiresAt: string | null | undefined): string | null => {
  if (!expiresAt) return null;

  const now = new Date();
  const expiry = parseDateInput(expiresAt);
  if (!expiry) {
    return null;
  }
  const diffMs = expiry.getTime() - now.getTime();

  if (diffMs <= 0) return "Expired";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h remaining`;

  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m remaining`;
};

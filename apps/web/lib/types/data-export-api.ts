/**
 * Shared types for the data export API and its consumers.
 *
 * These types describe the request/response shapes for the data export
 * endpoints (`/api/data-exports` and `/api/data-exports/request`). They
 * live here (rather than in the route files) so that both server and
 * client code can import them without creating a dependency from
 * hooks/components into route modules.
 *
 * @module
 * @category Types
 */
import type { ExportSummary } from "@/lib/export/types";

/**
 * A single data export record as returned by the API.
 */
export interface DataExport {
  id: number;
  status: "pending" | "processing" | "ready" | "failed" | "expired";
  requestedAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  fileSize?: number | null;
  downloadCount?: number | null;
  summary?: ExportSummary | null;
  errorLog?: string;
}

/**
 * Response format for the data exports list endpoint.
 */
export interface ExportListResponse {
  exports: DataExport[];
  total: number;
}

/**
 * Response format for requesting a new data export.
 */
export interface RequestExportResponse {
  message: string;
  exportId: number;
  summary: ExportSummary;
}

/**
 * Error response shape for data export request failures.
 */
export interface RequestExportError {
  error: string;
  exportId?: number;
  status?: string;
  requestedAt?: string;
  resetTime?: string;
  failedWindow?: string;
}

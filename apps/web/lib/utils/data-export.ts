/**
 * Utility functions for data export formatting and URLs.
 *
 * Pure functions with no React dependency — extracted from hooks
 * so they can be used in both React and non-React contexts.
 *
 * @module
 * @category Utils
 */
import { formatDate, parseDateInput } from "./date";

/**
 * Get download URL for an export.
 */
export const getExportDownloadUrl = (exportId: number): string => {
  return `/api/data-exports/${exportId}/download`;
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

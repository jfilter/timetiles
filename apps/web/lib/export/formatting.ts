/**
 * Download URL helper for data exports.
 *
 * Pure functions with no React dependency — extracted from hooks
 * so they can be used in both React and non-React contexts.
 *
 * @module
 * @category Export
 */

/**
 * Get download URL for an export.
 */
export const getExportDownloadUrl = (exportId: number): string => {
  return `/api/data-exports/${exportId}/download`;
};

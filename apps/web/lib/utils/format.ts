/**
 * General-purpose formatting utilities.
 *
 * @module
 * @category Utils
 */

/**
 * Format a byte count as a human-readable file size string.
 */
export const formatFileSize = (bytes: number | null | undefined): string => {
  if (!bytes) return "Unknown size";

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

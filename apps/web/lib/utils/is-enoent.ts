/**
 * Type guard for filesystem "file not found" errors.
 *
 * @module
 * @category Utilities
 */
export const isENOENT = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT";

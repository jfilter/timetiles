/**
 * Shared, isomorphic utilities for event ID formatting and preview.
 *
 * This module is the single source of truth for ID strategy constants,
 * sanitization, and formatting. Both the server-side ID generator
 * (`lib/services/id-generation.ts`) and the client-side preview hook
 * (`use-id-preview.ts`) import from here.
 *
 * @module
 * @category Utils
 */
import { getByPathOrKey } from "@/lib/utils/object-path";

/** The three supported ID generation strategies. */
export type IdStrategyType = "external" | "content-hash" | "auto-generate";

/** Maps each strategy to the prefix used in formatted IDs. */
export const ID_PREFIXES: Record<IdStrategyType, string> = {
  external: "ext",
  "content-hash": "hash",
  "auto-generate": "auto",
};

/**
 * Assemble a formatted event ID: `{datasetId}:{prefix}:{value}`.
 */
export const formatEventId = (datasetId: string, prefix: string, value: string): string =>
  `${datasetId}:${prefix}:${value}`;

/**
 * Validate and sanitize an external ID value.
 *
 * @throws If the ID is empty, too long, or contains invalid characters.
 */
export const sanitizeId = (id: unknown): string => {
  const str = String(id).trim();
  if (str.length === 0 || str.length > 255) {
    throw new Error(`Invalid ID length: ${str.length} (must be 1-255 characters)`);
  }
  if (!/^[\w\-.:]+$/.test(str)) {
    throw new Error(`Invalid ID format: ${str} (only alphanumeric, -, _, :, . allowed)`);
  }
  return str;
};

/**
 * Extract a field value from a data row using dot-notation and stringify it.
 *
 * @returns The stringified value, or `null` if missing/empty.
 */
export const extractExternalIdValue = (data: unknown, path: string): string | null => {
  if (!path) return null;
  const value = getByPathOrKey(data, path);
  if (value == null) return null;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string") return value;
  return String(value as number | boolean | bigint);
};

/** Options for {@link generateIdPreview}. */
interface IdPreviewOptions {
  /** Translated placeholder label for the content-hash strategy. */
  contentHashPlaceholder?: string;
  /** 1-based row index for auto-generate strategy. */
  autoIndex?: number;
}

/**
 * Generate a preview ID string for display in the ingest wizard.
 *
 * Uses the same strategy dispatch and field extraction as the real
 * server-side generator, but without crypto operations.
 */
export const generateIdPreview = (
  row: Record<string, unknown>,
  strategy: IdStrategyType,
  idField: string | null,
  options?: IdPreviewOptions
): string => {
  switch (strategy) {
    case "external": {
      if (!idField) return "";
      try {
        const value = extractExternalIdValue(row, idField);
        if (value == null || value === "") return "";
        return sanitizeId(value);
      } catch {
        return "";
      }
    }
    case "content-hash":
      return options?.contentHashPlaceholder ?? "";
    case "auto-generate":
      return `auto-${options?.autoIndex ?? 0}`;
    default:
      return "";
  }
};

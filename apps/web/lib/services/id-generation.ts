/**
 * Provides functions for generating unique identifiers for events.
 *
 * Three ID strategies:
 * - `external`: Uses a unique ID from a field in the source data.
 * - `content-hash`: Generates a deterministic SHA-256 hash from all fields (optionally excluding some).
 *    Used for dedup — identical rows produce the same ID.
 * - `auto-generate`: Generates a random unique ID per row. Dedup is not supported with this strategy.
 *
 * @module
 */
import { createHash, randomBytes } from "node:crypto";

import { extractExternalIdValue, formatEventId, ID_PREFIXES, sanitizeId } from "@/lib/utils/event-id";
import type { Dataset } from "@/payload-types";

/**
 * Generate a unique ID for an event row.
 *
 * For `external` and `content-hash`: deterministic — same input = same ID (dedup works).
 * For `auto-generate`: random — every row gets a unique ID (dedup must be disabled).
 */
export const generateUniqueId = (data: unknown, dataset: Pick<Dataset, "id" | "idStrategy">): string => {
  const result = generateEventId(data, dataset as Dataset);

  if (result.error) {
    throw new Error(`Failed to generate unique ID: ${result.error}`);
  }

  return result.uniqueId;
};

export const generateEventId = (
  data: unknown,
  dataset: Dataset
): { uniqueId: string; sourceId?: string; strategy: string; error?: string } => {
  const strategy = dataset.idStrategy;

  if (!strategy) {
    throw new Error("Dataset idStrategy is required but was undefined");
  }

  try {
    switch (strategy.type) {
      case "external":
        return generateExternalId(data, strategy, String(dataset.id));

      case "content-hash":
        return generateContentHashId(data, strategy, String(dataset.id));

      case "auto-generate":
        return generateAutoId(String(dataset.id));

      default:
        throw new Error(`Unknown ID strategy: ${strategy.type as string}`);
    }
  } catch (error) {
    return {
      uniqueId: `${dataset.id}:error:${Date.now()}`,
      strategy: strategy?.type ?? "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const generateExternalId = (
  data: unknown,
  strategy: { externalIdPath?: string | null },
  datasetId: string
): { uniqueId: string; sourceId: string; strategy: string } => {
  const sourceId = extractExternalIdValue(data, strategy.externalIdPath ?? "");

  if (sourceId == null || sourceId === "") {
    throw new Error(`Missing external ID at path: ${strategy.externalIdPath ?? "unknown"}`);
  }

  const sanitizedId = sanitizeId(sourceId);
  return {
    uniqueId: formatEventId(datasetId, ID_PREFIXES.external, sanitizedId),
    sourceId: sanitizedId,
    strategy: "external",
  };
};

/**
 * Generate a deterministic ID from row content via SHA-256 hash.
 * Optionally excludes specified fields (e.g., volatile timestamps).
 */
const generateContentHashId = (
  data: unknown,
  strategy: { excludeFields?: Array<{ fieldPath: string; id?: string | null }> | null },
  datasetId: string
): { uniqueId: string; strategy: string } => {
  let hashData = data;
  if (strategy.excludeFields && strategy.excludeFields.length > 0 && data && typeof data === "object") {
    const excludePaths = new Set(strategy.excludeFields.map((f) => f.fieldPath));
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!excludePaths.has(key)) {
        filtered[key] = value;
      }
    }
    hashData = filtered;
  }

  const hash = generateContentHash(hashData);
  return {
    uniqueId: formatEventId(datasetId, ID_PREFIXES["content-hash"], hash.substring(0, 16)),
    strategy: "content-hash",
  };
};

/** Generate a random unique ID. No dedup possible. */
const generateAutoId = (datasetId: string): { uniqueId: string; strategy: string } => {
  const timestamp = Date.now();
  const random = randomBytes(4).toString("hex");
  return {
    uniqueId: formatEventId(datasetId, ID_PREFIXES["auto-generate"], `${timestamp}:${random}`),
    strategy: "auto-generate",
  };
};

const generateContentHash = (data: unknown): string => {
  const sortReplacer = (_key: string, value: unknown): unknown => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b))) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  };
  const normalized = JSON.stringify(data, sortReplacer);
  return createHash("sha256").update(normalized).digest("hex");
};

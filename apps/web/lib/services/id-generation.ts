/**
 * @module Provides a service for generating unique identifiers for events.
 *
 * This service is responsible for creating consistent and unique IDs for event records based on
 * a dataset's configured ID strategy. It supports several strategies:
 * - `external`: Uses a unique ID provided in the source data.
 * - `computed`: Generates a hash from a specified set of fields in the data.
 * - `auto`: Generates a unique ID and a content hash for duplicate detection.
 * - `hybrid`: Attempts to use an external ID first and falls back to a computed ID.
 *
 * The service includes helpers for extracting values from nested objects and sanitizing IDs.
 */
import { createHash, randomBytes } from "crypto";

import type { Dataset } from "@/payload-types";

// Simple wrapper for use in job handlers
export const generateUniqueId = (data: unknown, idStrategy: Dataset["idStrategy"]): string => {
  const result = IdGenerationService.generateEventId(data, { idStrategy } as Dataset);
  return result.uniqueId;
};

export class IdGenerationService {
  static generateEventId(
    data: unknown,
    dataset: Dataset
  ): {
    uniqueId: string;
    sourceId?: string;
    contentHash?: string;
    strategy: string;
    error?: string;
  } {
    const strategy = dataset.idStrategy;

    if (!strategy) {
      return {
        uniqueId: `${dataset.id}:auto:${Date.now()}`,
        strategy: "auto",
      };
    }

    try {
      switch (strategy.type) {
        case "external":
          return this.generateExternalId(data, strategy, String(dataset.id));

        case "computed":
          return this.generateComputedId(data, strategy, String(dataset.id));

        case "auto":
          return this.generateAutoId(data, String(dataset.id));

        case "hybrid":
          return this.generateHybridId(data, strategy, String(dataset.id));

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
  }

  private static generateExternalId(
    data: unknown,
    strategy: { externalIdPath?: string | null },
    datasetId: string
  ): {
    uniqueId: string;
    sourceId: string;
    strategy: string;
  } {
    const sourceId = this.extractFieldValue(data, strategy.externalIdPath ?? "");

    if (sourceId == null || sourceId === "") {
      throw new Error(`Missing external ID at path: ${strategy.externalIdPath ?? "unknown"}`);
    }

    // Validate ID format
    const sanitizedId = this.sanitizeId(sourceId);

    return {
      uniqueId: `${datasetId}:ext:${sanitizedId}`,
      sourceId: sanitizedId,
      strategy: "external",
    };
  }

  private static generateComputedId(
    data: unknown,
    strategy: { computedIdFields?: Array<{ fieldPath: string; id?: string | null }> | null },
    datasetId: string
  ): {
    uniqueId: string;
    strategy: string;
  } {
    const values: Array<{ field: string; value: unknown }> = [];
    const missingFields: string[] = [];

    for (const fieldConfig of strategy.computedIdFields ?? []) {
      const value = this.extractFieldValue(data, fieldConfig.fieldPath);

      if (value === null || value === undefined) {
        missingFields.push(fieldConfig.fieldPath);
      } else {
        values.push({ field: fieldConfig.fieldPath, value });
      }
    }

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields for computed ID: ${missingFields.join(", ")}`);
    }

    // Create stable hash
    const sortedValues = [...values].sort((a, b) => a.field.localeCompare(b.field));
    const hashInput = sortedValues.map((v) => `${v.field}:${JSON.stringify(v.value)}`).join("|");

    const hash = createHash("sha256").update(`${datasetId}:${hashInput}`).digest("hex").substring(0, 16);

    return {
      uniqueId: `${datasetId}:comp:${hash}`,
      strategy: "computed",
    };
  }

  private static generateAutoId(
    data: unknown,
    datasetId: string
  ): {
    uniqueId: string;
    contentHash: string;
    strategy: string;
  } {
    // Generate content hash for duplicate detection
    const contentHash = this.generateContentHash(data);

    // Unique ID will be assigned after duplicate check
    // Using timestamp + cryptographically secure random for uniqueness
    const timestamp = Date.now();
    const random = randomBytes(4).toString("hex"); // 8 hex characters

    return {
      uniqueId: `${datasetId}:auto:${timestamp}:${random}`,
      contentHash,
      strategy: "auto",
    };
  }

  private static generateHybridId(
    data: unknown,
    strategy: {
      externalIdPath?: string | null;
      computedIdFields?: Array<{ fieldPath: string; id?: string | null }> | null;
    },
    datasetId: string
  ): {
    uniqueId: string;
    sourceId?: string;
    strategy: string;
  } {
    // Try external first
    try {
      return this.generateExternalId(data, strategy, datasetId);
    } catch (externalError) {
      // Fall back to computed
      try {
        return this.generateComputedId(data, strategy, datasetId);
      } catch (computedError) {
        throw new Error(
          `Hybrid ID generation failed. External: ${externalError instanceof Error ? externalError.message : "unknown"}. Computed: ${computedError instanceof Error ? computedError.message : "unknown"}`
        );
      }
    }
  }

  private static generateContentHash(data: unknown): string {
    // Sort keys for consistent hashing
    const obj = data as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    const normalized = JSON.stringify(obj, sortedKeys);

    return createHash("sha256").update(normalized).digest("hex");
  }

  private static extractFieldValue(data: unknown, path: string): unknown {
    if (!path) return null;

    const parts = path.split(".");
    let value = data as Record<string, unknown>;

    for (const part of parts) {
      if (value == null || typeof value !== "object") {
        return null;
      }
      value = value[part] as Record<string, unknown>;
    }

    return value;
  }

  private static sanitizeId(id: unknown): string {
    const str = String(id).trim();

    // Validate length
    if (str.length === 0 || str.length > 255) {
      throw new Error(`Invalid ID length: ${str.length} (must be 1-255 characters)`);
    }

    // Allow alphanumeric, dash, underscore, colon, dot
    if (!/^[\w\-.:]+$/.test(str)) {
      throw new Error(`Invalid ID format: ${str} (only alphanumeric, -, _, :, . allowed)`);
    }

    return str;
  }
}

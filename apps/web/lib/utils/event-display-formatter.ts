/**
 * Event display formatter - transforms arbitrary event data into displayable format.
 *
 * Uses field metadata from dataset schemas to intelligently select and format
 * fields for display without hardcoding specific field names.
 *
 * @module
 * @category Utils
 */

interface FieldStatistics {
  path: string;
  occurrences: number;
  occurrencePercent: number;
  uniqueValues?: number;
  typeDistribution?: Record<string, number>;
  formats?: Record<string, number>;
}

interface EventDisplayInfo {
  primaryLabel: string;
  fields: Array<{ key: string; value: string }>;
}

interface DisplayConfig {
  primaryLabelField?: string | null;
  displayFields?: Array<{ fieldPath: string; label?: string | null }> | null;
  maxDisplayFields?: number | null;
}

/**
 * Gets the dominant type for a field from type distribution.
 */
const getDominantType = (typeDistribution: Record<string, number> | undefined): string | null => {
  if (!typeDistribution) return null;

  let maxCount = 0;
  let dominantType: string | null = null;

  for (const [type, count] of Object.entries(typeDistribution)) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  return dominantType;
};

/**
 * Scores a field for use as a primary label.
 * Higher scores = better candidate for primary display.
 */
const scorePrimaryLabelField = (stats: FieldStatistics): number => {
  let score = 0;

  // High occurrence is critical
  score += (stats.occurrencePercent ?? 0) * 2;

  // String fields are preferred for labels
  const dominantType = getDominantType(stats.typeDistribution);
  if (dominantType === "string") {
    score += 30;
  }

  // Fields with moderate uniqueness are good (not too generic, not too unique)
  const uniqueRatio = (stats.uniqueValues ?? 0) / Math.max(stats.occurrences, 1);
  if (uniqueRatio > 0.5 && uniqueRatio < 1.0) {
    score += 20;
  }

  // Prefer top-level fields (lower depth)
  score += (5 - stats.path.split(".").length) * 5;

  // Boost common label field names
  const fieldName = stats.path.toLowerCase();
  if (fieldName.includes("title") || fieldName.includes("name")) {
    score += 40;
  } else if (fieldName.includes("subject") || fieldName.includes("heading")) {
    score += 30;
  } else if (fieldName.includes("label") || fieldName.includes("description")) {
    score += 20;
  }

  return score;
};

/**
 * Scores a field for inclusion in the display fields list.
 */
const scoreDisplayField = (stats: FieldStatistics): number => {
  let score = 0;

  // Occurrence percent is important
  score += (stats.occurrencePercent ?? 0);

  // Prefer primitive types (strings, numbers, booleans)
  const dominantType = getDominantType(stats.typeDistribution);
  if (dominantType === "string" || dominantType === "number" || dominantType === "boolean") {
    score += 20;
  }

  // Prefer fields with special formats
  if (stats.formats) {
    if (stats.formats.date || stats.formats.dateTime) score += 15;
    if (stats.formats.email) score += 10;
    if (stats.formats.url) score += 10;
  }

  // Prefer top-level fields
  score += (5 - stats.path.split(".").length) * 3;

  return score;
};

/**
 * Safely converts a value to a display string.
 */
const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    // Truncate long strings
    return value.length > 100 ? value.substring(0, 97) + "..." : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    // For objects/arrays, try to show something useful
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    return JSON.stringify(value).substring(0, 100);
  }
  return "";
};

/**
 * Gets a nested value from an object using a path like "location.city".
 */
const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
};

/**
 * Formats event data for display using field metadata and optional display configuration.
 *
 * @param eventData - The raw event data object
 * @param fieldMetadata - Field statistics from the dataset schema
 * @param eventId - Fallback event ID if no good label found
 * @param displayConfig - Optional display configuration from dataset
 * @param maxFields - Maximum number of fields to display (default: 3)
 * @returns Structured display information
 */
export const formatEventForDisplay = (
  eventData: Record<string, unknown>,
  fieldMetadata: Record<string, FieldStatistics> | null | undefined,
  eventId: string | number,
  displayConfig?: DisplayConfig | null,
  maxFields: number = 3
): EventDisplayInfo => {
  // Use configured max fields if available
  const effectiveMaxFields = displayConfig?.maxDisplayFields ?? maxFields;

  // If no metadata, show first few fields from the data
  if (!fieldMetadata || Object.keys(fieldMetadata).length === 0) {
    const entries = Object.entries(eventData).slice(0, effectiveMaxFields);
    return {
      primaryLabel: `Event ${eventId}`,
      fields: entries.map(([key, value]) => ({
        key,
        value: formatValue(value),
      })),
    };
  }

  // Convert fieldMetadata to array and score each field
  const fieldStats = Object.values(fieldMetadata);

  // === PRIMARY LABEL SELECTION ===
  let primaryLabel = `Event ${eventId}`;

  // 1. Check if there's a configured primary label field
  if (displayConfig?.primaryLabelField) {
    const labelValue = getNestedValue(eventData, displayConfig.primaryLabelField);
    const formatted = formatValue(labelValue);
    if (formatted) {
      primaryLabel = formatted;
    }
  } else {
    // 2. Fall back to automatic selection
    const labelCandidates = fieldStats
      .filter((stats) => stats.occurrencePercent > 50) // At least 50% occurrence
      .sort((a, b) => scorePrimaryLabelField(b) - scorePrimaryLabelField(a));

    if (labelCandidates.length > 0 && labelCandidates[0]) {
      const labelField = labelCandidates[0];
      const labelValue = getNestedValue(eventData, labelField.path);
      const formatted = formatValue(labelValue);
      if (formatted) {
        primaryLabel = formatted;
      }
    }
  }

  // === DISPLAY FIELDS SELECTION ===
  let fields: Array<{ key: string; value: string }> = [];

  // 1. Check if there are configured display fields
  if (displayConfig?.displayFields && displayConfig.displayFields.length > 0) {
    fields = displayConfig.displayFields
      .map((fieldConfig) => {
        const value = getNestedValue(eventData, fieldConfig.fieldPath);
        const formatted = formatValue(value);
        if (!formatted) return null;

        return {
          key: fieldConfig.label || fieldConfig.fieldPath,
          value: formatted,
        };
      })
      .filter((field): field is { key: string; value: string } => field !== null)
      .slice(0, effectiveMaxFields);
  } else {
    // 2. Fall back to automatic selection
    const displayCandidates = fieldStats
      .filter((stats) => stats.occurrencePercent > 30) // At least 30% occurrence
      .sort((a, b) => scoreDisplayField(b) - scoreDisplayField(a))
      .slice(0, effectiveMaxFields);

    fields = displayCandidates
      .map((stats) => {
        const value = getNestedValue(eventData, stats.path);
        const formatted = formatValue(value);
        if (!formatted) return null;

        return {
          key: stats.path,
          value: formatted,
        };
      })
      .filter((field): field is { key: string; value: string } => field !== null);
  }

  return {
    primaryLabel,
    fields,
  };
};

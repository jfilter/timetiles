/**
 * Defines the TypeScript types and interfaces related to schema detection and validation.
 *
 * This file serves as a central repository for the data structures used throughout the schema
 * building and import validation process. It ensures type safety and consistency when dealing
 * with complex objects that represent schema fields, field statistics, schema changes, and
 * duplicate information.
 *
 * @module
 */
export interface SchemaField {
  path: string;
  type: "string" | "number" | "boolean" | "null" | "date" | "array" | "object" | "mixed";
  format?: string; // email, uri, date-time, latitude, longitude
  nullable: boolean;
  enum?: Array<string | number | boolean | null>;
  items?: SchemaField; // for arrays
  properties?: Record<string, SchemaField>; // for objects
}

export interface FieldStatistics {
  path: string;
  occurrences: number;
  occurrencePercent: number;
  nullCount: number;
  uniqueValues: number;
  uniqueSamples: Array<string | number | boolean | null | Record<string, unknown>>; // Keep up to threshold
  typeDistribution: Record<string, number>;

  // Type hints
  formats: {
    email?: number;
    url?: number;
    dateTime?: number;
    date?: number;
    numeric?: number; // numeric strings
  };

  // Numeric stats
  numericStats?: {
    min: number;
    max: number;
    avg: number;
    isInteger: boolean;
  };

  // Enum detection
  isEnumCandidate: boolean;
  enumValues?: Array<{ value: unknown; count: number; percent: number }>;

  // Geographic detection
  geoHints?: {
    isLatitude: boolean;
    isLongitude: boolean;
    fieldNamePattern: string; // lat, latitude, lng, longitude, etc.
    valueRange: boolean; // within valid lat/lng range
  };

  // Metadata
  firstSeen: Date;
  lastSeen: Date;
  depth: number;
}

export interface SchemaBuilderState {
  version: number;
  fieldStats: Record<string, FieldStatistics>;
  recordCount: number;
  batchCount: number;
  lastUpdated: Date;

  // Samples for quicktype
  dataSamples: unknown[]; // Keep rotating buffer of N samples
  maxSamples: number;

  // Detected patterns
  detectedIdFields: string[]; // Fields that look like IDs
  detectedGeoFields: {
    latitude?: string;
    longitude?: string;
    combinedField?: string;
    combinedFormat?: string;
    addressField?: string;
    confidence: number;
  };

  // Type conflicts
  typeConflicts: Array<{
    path: string;
    types: Record<string, number>;
    samples: Array<{ type: string; value: unknown }>;
  }>;
}

export interface SchemaChange {
  type: "new_field" | "removed_field" | "type_change" | "enum_change" | "format_change";
  path: string;
  details: unknown;
  severity: "info" | "warning" | "error";
  autoApprovable: boolean;
}

export interface SchemaComparison {
  changes: SchemaChange[];
  isBreaking: boolean;
  requiresApproval: boolean;
  canAutoApprove: boolean;
}

export interface DuplicateInfo {
  existingId: string;
  existingUniqueId: string;
  strategy: "uniqueId" | "contentHash";
}

export interface DuplicateAction {
  action: "skipped" | "updated" | "versioned";
  existingId: string;
  newId?: string;
}

/**
 * Type guard to check if schema builder state is valid.
 */
export const isValidSchemaBuilderState = (state: unknown): state is SchemaBuilderState => {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return false;
  }

  const s = state as Record<string, unknown>;
  return (
    typeof s.version === "number" &&
    typeof s.fieldStats === "object" &&
    typeof s.recordCount === "number" &&
    typeof s.batchCount === "number" &&
    (s.lastUpdated instanceof Date || typeof s.lastUpdated === "string") &&
    Array.isArray(s.dataSamples) &&
    typeof s.maxSamples === "number" &&
    Array.isArray(s.detectedIdFields) &&
    typeof s.detectedGeoFields === "object" &&
    Array.isArray(s.typeConflicts)
  );
};

/**
 * Safe getter for schema builder state from import job.
 */
export const getSchemaBuilderState = (job: { schemaBuilderState?: unknown }): SchemaBuilderState | null => {
  if (isValidSchemaBuilderState(job.schemaBuilderState)) {
    return job.schemaBuilderState;
  }
  return null;
};

/**
 * Safe getter for field statistics from schema builder state.
 */
export const getFieldStats = (job: { schemaBuilderState?: unknown }): Record<string, FieldStatistics> => {
  const state = getSchemaBuilderState(job);
  return state?.fieldStats ?? {};
};

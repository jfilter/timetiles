/**
 * Utility functions for extracting and formatting event detail data.
 *
 * Pure helper functions used by the EventDetailContent component and its
 * child components for data extraction, type coercion, and display formatting.
 *
 * @module
 * @category Utils
 */

import { isValidCoordinate } from "@/lib/geospatial/validation";

/** Type for event data object — keys are dynamic, determined by source file + transforms */
export interface EventData {
  [key: string]: unknown;
}

/** Field mappings from a dataset's fieldMappingOverrides */
export interface FieldMappingOverrides {
  titlePath?: string | null;
  descriptionPath?: string | null;
  locationNamePath?: string | null;
  timestampPath?: string | null;
  endTimestampPath?: string | null;
  latitudePath?: string | null;
  longitudePath?: string | null;
  locationPath?: string | null;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/** Extract a non-empty string value from a data object by field path. Returns null if missing, empty, or non-primitive. */
export const extractFieldFromData = (data: unknown, path: string | null | undefined): string | null => {
  if (!path || typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const value = (data as Record<string, unknown>)[path];
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
};

/**
 * Build the set of transformedData keys already rendered by dedicated UI sections.
 *
 * Includes:
 * - Dynamic mapping paths from dataset fieldMappingOverrides (actual column names
 *   whose values were extracted into top-level Event fields during import)
 * - Literal keys probed by extractEventFields as fallbacks ("title", "name", "description")
 * - "id" (structural, not user data)
 */
export const buildConsumedFieldSet = (
  fieldMappings?: FieldMappingOverrides | null,
  idStrategy?: { externalIdPath?: string | null } | null
): Set<string> => {
  const keys = new Set<string>(["id", "title", "name", "description"]);
  if (fieldMappings) {
    for (const path of Object.values(fieldMappings)) {
      if (typeof path === "string" && path) {
        keys.add(path);
      }
    }
  }
  if (idStrategy?.externalIdPath) {
    keys.add(idStrategy.externalIdPath);
  }
  return keys;
};

/**
 * Extract title and description from event data using dataset field mappings.
 *
 * Single source of truth for field extraction — used by both the v1 API
 * (transformEvent) and client-side components (event detail modal, events list).
 * Tries the mapped field path first, then common fallback names.
 */
export const extractEventFields = (
  eventData: unknown,
  fieldMappings?: FieldMappingOverrides | null,
  eventId?: number
): { title: string; description: string | null } => {
  const title =
    extractFieldFromData(eventData, fieldMappings?.titlePath) ??
    extractFieldFromData(eventData, "title") ??
    extractFieldFromData(eventData, "name") ??
    (eventId != null ? `Event ${eventId}` : "Untitled Event");

  const description =
    extractFieldFromData(eventData, fieldMappings?.descriptionPath) ?? extractFieldFromData(eventData, "description");

  return { title, description };
};

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

/** Extract the data object from an event, handling non-object or array cases.
 *  Accepts both Payload Event objects (`transformedData`) and API DTOs (`data`). */
export const getEventData = (event: { transformedData?: unknown; data?: unknown }): EventData => {
  const raw = event.transformedData ?? event.data;
  return typeof raw === "object" && raw != null && !Array.isArray(raw) ? (raw as EventData) : {};
};

/** Get event title from data, using field mappings when available. */
export const getEventTitle = (eventData: EventData, fieldMappings?: FieldMappingOverrides | null): string => {
  return extractEventFields(eventData, fieldMappings).title;
};

/** Extract dataset name, ID, and optional catalog from a dataset relation value */
export const getDatasetInfo = (dataset: unknown): { id: number; name: string; catalog?: string } | null => {
  if (typeof dataset === "object" && dataset != null && "id" in dataset) {
    const d = dataset as Record<string, unknown>;
    const name = typeof d.name === "string" ? d.name : null;
    if (name) {
      const catalog =
        typeof d.catalog === "object" && d.catalog != null && "name" in (d.catalog as Record<string, unknown>)
          ? ((d.catalog as Record<string, unknown>).name as string | undefined)
          : undefined;
      return { id: Number(d.id), name, catalog };
    }
  }
  return null;
};

// Re-exported from date.ts — canonical home for date formatting utilities
export { formatDateRange } from "@/lib/utils/date";

/** Build a location display string from top-level event fields (extracted during import) */
export const getLocationDisplay = (event: Record<string, unknown> | object): string | null => {
  const eventRecord = event as Record<string, unknown>;
  // Prefer location name (venue, place name) if available
  const locationName = typeof eventRecord.locationName === "string" ? eventRecord.locationName : null;
  if (locationName) {
    return locationName;
  }
  // Fall back to geocoded/normalized address (nested Payload shape or flat DTO)
  const geocodingInfo = eventRecord.geocodingInfo as { normalizedAddress?: string | null } | null | undefined;
  if (geocodingInfo?.normalizedAddress) {
    return geocodingInfo.normalizedAddress;
  }
  const geocodedAddress = typeof eventRecord.geocodedAddress === "string" ? eventRecord.geocodedAddress : null;
  if (geocodedAddress) {
    return geocodedAddress;
  }
  return null;
};

/** Check whether an event has valid (non-zero) coordinates. Delegates to {@link isValidCoordinate}. */
export const hasValidCoordinates = (
  location: { latitude?: number | null; longitude?: number | null } | null | undefined
): boolean => {
  return isValidCoordinate(location?.latitude ?? null, location?.longitude ?? null);
};

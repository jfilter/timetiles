/**
 * Utility functions for extracting and formatting event detail data.
 *
 * Pure helper functions used by the EventDetailContent component and its
 * child components for data extraction, type coercion, and display formatting.
 *
 * @module
 * @category Utils
 */

/** Type for event data object */
export interface EventData {
  title?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  [key: string]: unknown;
}

/** Safely convert an unknown value to a string, returning empty string for unsupported types */
export const safeToString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
};

/** Extract the data object from an event, handling non-object or array cases */
export const getEventData = (event: { data: unknown }): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

/** Get event title from data, falling back to name then "Untitled Event" */
export const getEventTitle = (eventData: EventData): string => {
  return safeToString(eventData.title) || safeToString(eventData.name) || "Untitled Event";
};

/** Extract dataset name and ID from a dataset relation value */
export const getDatasetInfo = (dataset: unknown): { name: string; id: number } | null => {
  if (typeof dataset === "object" && dataset != null && "id" in dataset) {
    const d = dataset as Record<string, unknown>;
    // API returns 'title', Payload returns 'name'
    let name: string | null = null;
    if (typeof d.title === "string") {
      name = d.title;
    } else if (typeof d.name === "string") {
      name = d.name;
    }
    if (name) {
      return { name, id: Number(d.id) };
    }
  }
  return null;
};

/** Format start/end dates into a human-readable range string */
export const formatDateRange = (startDate: unknown, endDate: unknown, locale: string = "en-US"): string | null => {
  const hasStart = startDate != null && safeToString(startDate) !== "";
  const hasEnd = endDate != null && safeToString(endDate) !== "";

  if (!hasStart && !hasEnd) return null;

  const parts: string[] = [];
  if (hasStart) {
    parts.push(new Date(safeToString(startDate)).toLocaleDateString(locale));
  }
  if (hasEnd && safeToString(startDate) !== safeToString(endDate)) {
    parts.push(new Date(safeToString(endDate)).toLocaleDateString(locale));
  }

  return parts.join(" - ");
};

/** Build a location display string from event and data fields */
export const getLocationDisplay = (event: Record<string, unknown> | object, eventData: EventData): string | null => {
  const eventRecord = event as Record<string, unknown>;
  // Prefer location name (venue, place name) if available
  const locationName = typeof eventRecord.locationName === "string" ? eventRecord.locationName : null;
  if (locationName) {
    return locationName;
  }
  // Fall back to geocoded/normalized address
  const geocodingInfo = eventRecord.geocodingInfo as { normalizedAddress?: string | null } | null | undefined;
  if (geocodingInfo?.normalizedAddress) {
    return geocodingInfo.normalizedAddress;
  }
  // Final fallback to city/country from data
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

/** Check whether an event has valid (non-zero) coordinates */
export const hasValidCoordinates = (
  location: { latitude?: number | null; longitude?: number | null } | null | undefined
): boolean => {
  return (
    location?.latitude != null && location.latitude !== 0 && location?.longitude != null && location.longitude !== 0
  );
};

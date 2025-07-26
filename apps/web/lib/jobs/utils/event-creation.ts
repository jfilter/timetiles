import type { Payload } from "payload";

import type { createJobLogger } from "@/lib/logger";
import { logError } from "@/lib/logger";
import type { Dataset, Event, Import } from "@/payload-types";

import { safeStringValue } from "./data-validation";

// Build location data from coordinates
const buildLocationData = (coordinates?: { lat: number; lng: number }) => {
  if (!coordinates) return undefined;
  return {
    latitude: coordinates.lat,
    longitude: coordinates.lng,
  };
};

// Build coordinate source for imported coordinates
const buildImportCoordinateSource = () => ({
  type: "import" as const,
  confidence: 1.0,
  validationStatus: "valid" as const,
});

// Build coordinate source for missing coordinates
const buildMissingCoordinateSource = () => ({
  type: "none" as const,
  confidence: 0.0,
  validationStatus: "invalid" as const,
});

// Build geocoding information from address
const buildGeocodingInfo = (address?: string | null) => {
  if (address == null || address.length === 0) return undefined;
  return {
    originalAddress: address,
    provider: null,
    confidence: null,
    normalizedAddress: null,
  };
};

// Build the complete event payload
const buildEventPayload = (
  eventData: Record<string, unknown>,
  coordinates: { lat: number; lng: number } | undefined,
  address: string | null,
  dataset: Dataset,
  importId: Import["id"],
) => {
  const hasCoordinates = coordinates != null;

  return {
    name: safeStringValue(eventData, "title") ?? safeStringValue(eventData, "name") ?? "Untitled Event",
    description: safeStringValue(eventData, "description") ?? "",
    date: (eventData.date as string) || new Date().toISOString(),
    endDate: eventData.endDate as string | null,
    location: buildLocationData(coordinates),
    coordinateSource: hasCoordinates ? buildImportCoordinateSource() : buildMissingCoordinateSource(),
    geocodingInfo: buildGeocodingInfo(address),
    tags: Array.isArray(eventData.tags) ? (eventData.tags as string[]) : [],
    category: safeStringValue(eventData, "category") ?? "",
    url: safeStringValue(eventData, "url") ?? "",
    dataset: dataset.id,
    import: importId,
    data: (eventData.originalData as Record<string, unknown>) ?? eventData,
  };
};

export const createSingleEvent = async (
  payload: Payload,
  eventData: Record<string, unknown>,
  dataset: Dataset,
  importId: Import["id"],
  currentImport: Import,
  logger: ReturnType<typeof createJobLogger>,
): Promise<{ success: boolean; eventId?: number; hasPreExistingCoords?: boolean }> => {
  try {
    const hasPreExistingCoords = eventData.preExistingCoordinates != null;
    const coordinates = eventData.preExistingCoordinates as { lat: number; lng: number } | undefined;
    const address = safeStringValue(eventData, "address") ?? safeStringValue(eventData, "location");

    const eventPayload = buildEventPayload(eventData, coordinates, address, dataset, importId);

    const createdEvent = await payload.create({
      collection: "events",
      data: eventPayload as Omit<Event, "id" | "updatedAt" | "createdAt"> &
        Partial<Pick<Event, "id" | "updatedAt" | "createdAt">>,
    });

    logger.debug("Event created successfully", {
      eventId: createdEvent.id,
      name: eventPayload.name,
      hasCoordinates: !!coordinates,
      hasAddress: address != null && address.length > 0,
    });

    return {
      success: true,
      eventId: createdEvent.id,
      hasPreExistingCoords,
    };
  } catch (error) {
    logError(error, "Failed to create event", {
      title: eventData.title,
      importId,
    });
    return { success: false };
  }
};

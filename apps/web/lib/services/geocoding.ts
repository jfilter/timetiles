/**
 * @module This file serves as the primary entry point for accessing the geocoding functionality.
 *
 * It exports a simplified `geocodeAddress` function that acts as a wrapper around the more
 * complex `GeocodingService`. This approach abstracts the underlying implementation details,
 * such as service initialization and dependency injection, providing a clean and easy-to-use
 * interface for other parts of the application that need to perform geocoding lookups.
 */
import type { Payload } from "payload";

import { GeocodingService } from "./geocoding/geocoding-service";

// Re-export the geocoding result type
export type { GeocodingResult } from "./geocoding/types";

// This is a wrapper to use the existing geocoding service
// In a real implementation, the payload instance would be injected via context
let geocodingService: GeocodingService | null = null;

export const initializeGeocoding = (payload: Payload) => {
  geocodingService = new GeocodingService(payload);
};

export const geocodeAddress = async (address: string) => {
  if (!geocodingService) {
    throw new Error("Geocoding service not initialized. Call initializeGeocoding(payload) first.");
  }
  return geocodingService.geocode(address);
};

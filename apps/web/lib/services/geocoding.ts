/**
 * Entry point for accessing the geocoding functionality.
 *
 * Exports a `createGeocodingService` factory that returns a ready-to-use
 * `GeocodingService` instance. The service lazily initializes itself on the
 * first call to `geocode()`, so no separate init step is needed.
 *
 * @module
 */
import type { Payload } from "payload";

import { GeocodingService } from "./geocoding/geocoding-service";

// Re-export the geocoding result type
export type { GeocodingResult } from "./geocoding/types";

/**
 * Create a new GeocodingService instance bound to the given Payload instance.
 *
 * The returned service lazily loads settings and providers on first use,
 * so there is no separate initialization step required.
 */
export const createGeocodingService = (payload: Payload): GeocodingService => {
  return new GeocodingService(payload);
};

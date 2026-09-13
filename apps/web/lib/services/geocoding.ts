/**
 * Entry point for accessing the geocoding functionality.
 *
 * Re-exports the GeocodingService class. The service lazily initializes itself
 * on the first call to `geocode()`, so no separate init step is needed.
 *
 * @module
 */
export { createGeocodingService, GeocodingService } from "./geocoding/geocoding-service";

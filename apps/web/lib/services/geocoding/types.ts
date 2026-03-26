/**
 * Defines the core TypeScript types, interfaces, and constants for the geocoding service.
 *
 * This file serves as a central repository for the data structures and contracts used throughout
 * the geocoding system. It ensures type safety and consistency across different modules,
 * including the main service, provider manager, cache manager, and operations.
 *
 * It defines:
 * - The structure of a geocoding result.
 * - The shape of batch geocoding results.
 * - A custom `GeocodingError` class for standardized error handling.
 * - Configuration interfaces for providers and the overall service settings.
 * - Shared constants like collection slugs and default URLs.
 *
 * @module
 */
import type NodeGeocoder from "node-geocoder";

import type { LocationCache } from "@/payload-types";

export interface GeocodingResult extends Pick<
  LocationCache,
  "latitude" | "longitude" | "confidence" | "provider" | "normalizedAddress"
> {
  components: LocationCache["components"];
  metadata: LocationCache["metadata"];
  fromCache?: boolean;
}

export interface BatchGeocodingResult {
  results: Map<string, GeocodingResult | GeocodingError>;
  summary: { total: number; successful: number; failed: number; cached: number };
}

export class GeocodingError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public httpStatus?: number,
    public retryAfterMs?: number
  ) {
    super(message);
    this.name = "GeocodingError";
  }
}

/** Error codes for structured error handling */
export const GEOCODING_ERROR_CODES = {
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  AUTH_FAILURE: "AUTH_FAILURE",
  NO_RESULTS: "NO_RESULTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  ALL_PROVIDERS_FAILED: "ALL_PROVIDERS_FAILED",
  GEOCODING_FAILED: "GEOCODING_FAILED",
} as const;

/** Check if an error is transient (worth retrying). */
export const isTransientError = (error: unknown): boolean => {
  if (!(error instanceof GeocodingError)) return false;
  return (
    error.retryable ||
    error.code === GEOCODING_ERROR_CODES.RATE_LIMITED ||
    error.code === GEOCODING_ERROR_CODES.SERVICE_UNAVAILABLE ||
    error.code === GEOCODING_ERROR_CODES.PROVIDER_TIMEOUT
  );
};

export interface ProviderConfig {
  name: string;
  geocoder: NodeGeocoder.Geocoder;
  priority: number;
  enabled: boolean;
  rateLimit: number; // requests per second
  group?: string; // providers in the same group are queried in parallel
}

/** Default rate limit for Nominatim public instance (1 request/second per OSM policy) */
export const DEFAULT_NOMINATIM_RATE_LIMIT = 1;

export interface GeocodingSettings {
  enabled: boolean;
  fallbackEnabled: boolean;
  providerSelection: { strategy: string; requiredTags: string[] };
  caching: { enabled: boolean; ttlDays: number };
}

/** Bias parameters to improve geocoding accuracy for a known region. */
export interface GeocodingBias {
  /** ISO 3166-1 alpha-2 country codes to restrict results (e.g. ["ua", "pl"]). */
  countryCodes?: string[];
  /** Bounding box to prefer results within a geographic area. */
  viewBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  /** Strictly restrict results to the view box (not just prefer). */
  bounded?: boolean;
}

// Constants
export const LOCATION_CACHE_COLLECTION = "location-cache";
export const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
export const TIMETILES_USER_AGENT = "TimeTiles/1.0 (https://github.com/jfilter/timetiles)";

/**
 * @module Defines the core TypeScript types, interfaces, and constants for the geocoding service.
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
 */
import type NodeGeocoder from "node-geocoder";

import type { LocationCache } from "@/payload-types";

export interface GeocodingResult
  extends Pick<LocationCache, "latitude" | "longitude" | "confidence" | "provider" | "normalizedAddress"> {
  components: LocationCache["components"];
  metadata: LocationCache["metadata"];
  fromCache?: boolean;
}

export interface BatchGeocodingResult {
  results: Map<string, GeocodingResult | GeocodingError>;
  summary: {
    total: number;
    successful: number;
    failed: number;
    cached: number;
  };
}

export class GeocodingError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "GeocodingError";
  }
}

export interface ProviderConfig {
  name: string;
  geocoder: NodeGeocoder.Geocoder;
  priority: number;
  enabled: boolean;
}

export interface GeocodingSettings {
  enabled: boolean;
  fallbackEnabled: boolean;
  providerSelection: {
    strategy: string;
    requiredTags: string[];
  };
  caching: {
    enabled: boolean;
    ttlDays: number;
  };
}

// Constants
export const LOCATION_CACHE_COLLECTION = "location-cache";
export const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
export const TIMETILES_USER_AGENT = "TimeTiles-Test/1.0";

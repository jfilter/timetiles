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
    public retryable: boolean = false,
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

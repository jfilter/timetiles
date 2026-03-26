/**
 * Custom geocoder wrapper for the Photon API (https://photon.komoot.io).
 *
 * Photon is a free, open-source geocoding API built on OpenStreetMap data.
 * Since node-geocoder does not include a Photon provider, this wrapper
 * adapts the Photon GeoJSON response to the node-geocoder Entry format.
 *
 * @module
 */
import type { Entry } from "node-geocoder";

import { createLogger } from "@/lib/logger";

import { GEOCODING_ERROR_CODES, GeocodingError } from "./types";

const logger = createLogger("photon-geocoder");

interface PhotonFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    district?: string;
    locality?: string;
    type?: string;
    extent?: [number, number, number, number];
  };
}

interface PhotonResponse {
  type: "FeatureCollection";
  features: PhotonFeature[];
}

interface PhotonConfig {
  baseUrl: string;
  language?: string;
  limit?: number;
  locationBias?: { lat: number; lon: number; zoom?: number };
  bbox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  osmTag?: string;
  layer?: string[];
}

/** Build URLSearchParams from Photon config and query address. */
const buildPhotonParams = (address: string, config: PhotonConfig): URLSearchParams => {
  const { language, limit = 5, locationBias, bbox, osmTag, layer } = config;
  const params = new URLSearchParams({ q: address, limit: String(limit) });
  if (language) {
    params.set("lang", language);
  }
  if (locationBias) {
    params.set("lat", String(locationBias.lat));
    params.set("lon", String(locationBias.lon));
    if (locationBias.zoom != null) {
      params.set("zoom", String(locationBias.zoom));
    }
  }
  if (bbox) {
    params.set("bbox", `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`);
  }
  if (osmTag) {
    params.set("osm_tag", osmTag);
  }
  if (layer && layer.length > 0) {
    for (const l of layer) {
      params.append("layer", l);
    }
  }
  return params;
};

/** Classify a non-OK Photon HTTP response into a typed GeocodingError. */
const classifyPhotonError = (response: Response): GeocodingError => {
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
    return new GeocodingError(
      `Photon rate limited: ${response.status}`,
      GEOCODING_ERROR_CODES.RATE_LIMITED,
      true,
      429,
      retryAfterMs
    );
  }
  if (response.status === 503) {
    return new GeocodingError(
      `Photon service unavailable: ${response.status}`,
      GEOCODING_ERROR_CODES.SERVICE_UNAVAILABLE,
      true,
      503
    );
  }
  // Photon returns 200 with empty features for "not found", so any 404
  // under load is actually server-side throttling/load-shedding.
  if (response.status === 404) {
    return new GeocodingError(
      `Photon overloaded (404 as throttle): ${response.status}`,
      GEOCODING_ERROR_CODES.RATE_LIMITED,
      true,
      404
    );
  }
  return new GeocodingError(
    `Photon API error: ${response.status} ${response.statusText}`,
    GEOCODING_ERROR_CODES.GEOCODING_FAILED,
    false,
    response.status
  );
};

/**
 * Creates a geocoder object compatible with node-geocoder's Geocoder interface,
 * backed by the Photon API.
 */
export const createPhotonGeocoder = (config: PhotonConfig): { geocode: (address: string) => Promise<Entry[]> } => {
  const { baseUrl } = config;

  return {
    geocode: async (address: string): Promise<Entry[]> => {
      const params = buildPhotonParams(address, config);
      const url = `${baseUrl}/api?${params.toString()}`;
      logger.debug("Photon geocode request", { url, address });

      const response = await fetch(url, {
        headers: { "User-Agent": "TimeTiles/1.0 (https://github.com/jfilter/timetiles)" },
      });

      if (!response.ok) {
        throw classifyPhotonError(response);
      }

      const data = (await response.json()) as PhotonResponse;

      if (!data.features || data.features.length === 0) {
        return [];
      }

      return data.features.map(formatPhotonFeature);
    },
  };
};

/**
 * Estimate confidence from Photon's OSM type classification.
 * Photon doesn't provide an explicit confidence score, so we derive one
 * from the specificity of the result.
 */
const getPhotonConfidence = (props: PhotonFeature["properties"]): number => {
  // House-level match
  if (props.housenumber && props.street) return 0.9;
  // Street-level match
  if (props.street) return 0.75;
  // City/district-level match
  if (props.city ?? props.district) return 0.6;
  // Country/state-level match
  return 0.5;
};

const formatPhotonFeature = (feature: PhotonFeature): Entry => {
  const [longitude, latitude] = feature.geometry.coordinates;
  const props = feature.properties;

  const parts = [
    props.name,
    props.housenumber ? `${props.street} ${props.housenumber}` : props.street,
    props.city,
    props.state,
    props.country,
  ].filter(Boolean);

  return {
    latitude,
    longitude,
    formattedAddress: parts.join(", "),
    country: props.country ?? undefined,
    countryCode: props.countrycode?.toUpperCase(),
    city: props.city ?? undefined,
    state: props.state ?? undefined,
    zipcode: props.postcode ?? undefined,
    streetName: props.street ?? undefined,
    streetNumber: props.housenumber ?? undefined,
    extra: { confidence: getPhotonConfidence(props) },
  };
};

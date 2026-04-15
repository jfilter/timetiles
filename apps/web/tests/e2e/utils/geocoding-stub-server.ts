/**
 * HTTP stub server that mocks external geocoding providers for E2E tests.
 *
 * Replaces real calls to Photon (geocode.versatiles.org, photon.komoot.io)
 * and Nominatim (nominatim.openstreetmap.org) so the E2E test suite can
 * run without network access and without hitting rate limits.
 *
 * The E2E seed points the geocoding-providers collection at this server's
 * URL, so the production geocoding service code path is exercised for real
 * (provider selection, HTTP request, response parsing) — only the wire
 * response is synthesized here.
 *
 * @module
 * @category E2E Utils
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Derive deterministic lat/lng from the query string using a simple string
 * hash. Keeps coordinates inside valid ranges (lat: -85..85, lng: -179..179)
 * so they don't get rejected by isValidCoordinate() or the (0,0) null-island
 * check downstream.
 */
const coordsForQuery = (query: string): { lat: number; lng: number } => {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = (hash * 31 + query.charCodeAt(i)) | 0;
  }
  // Shift off 0 to avoid Null Island rejection; spread over most of the globe
  const lat = ((Math.abs(hash) % 17000) / 100 - 85) * 0.95 || 0.1;
  const lng = ((Math.abs(hash * 7) % 35800) / 100 - 179) * 0.95 || 0.1;
  return { lat, lng };
};

/**
 * Build a Photon API response for a query. The shape matches what
 * `apps/web/lib/services/geocoding/photon-geocoder.ts` parses.
 */
const buildPhotonResponse = (query: string): unknown => {
  const { lat, lng } = coordsForQuery(query);
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [lng, lat] },
        properties: {
          osm_id: Math.abs(lat * 1000) | 0,
          osm_type: "N",
          osm_key: "place",
          osm_value: "locality",
          name: query,
          city: query,
          country: "Stubland",
          countrycode: "xx",
        },
      },
    ],
  };
};

/**
 * Build a Nominatim API response (array of search results).
 * Matches the shape node-geocoder expects from the openstreetmap provider.
 */
const buildNominatimResponse = (query: string): unknown => {
  const { lat, lng } = coordsForQuery(query);
  return [
    {
      place_id: Math.abs(lat * 1000) | 0,
      osm_type: "node",
      osm_id: Math.abs(lat * 1000) | 0,
      lat: String(lat),
      lon: String(lng),
      display_name: `${query}, Stubland`,
      class: "place",
      type: "locality",
      importance: 0.5,
      address: { city: query, country: "Stubland", country_code: "xx" },
    },
  ];
};

interface StubServerHandle {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

/**
 * Start the stub server on an ephemeral port. Returns the base URL and a
 * stop function. The base URL serves:
 *   /photon/api?q=<address>   — Photon FeatureCollection response
 *   /nominatim/search?q=<..>  — Nominatim array response
 * Both routes are idempotent and deterministic (same query → same coords).
 */
export const startGeocodingStubServer = async (): Promise<StubServerHandle> => {
  const server: Server = createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end();
      return;
    }

    const parsed = new URL(req.url, "http://localhost");
    const query = parsed.searchParams.get("q") ?? "";

    res.setHeader("Content-Type", "application/json");

    if (parsed.pathname.startsWith("/photon/api")) {
      res.statusCode = 200;
      res.end(JSON.stringify(buildPhotonResponse(query)));
      return;
    }

    if (parsed.pathname.startsWith("/nominatim/search")) {
      res.statusCode = 200;
      res.end(JSON.stringify(buildNominatimResponse(query)));
      return;
    }

    // Unknown path: log and return empty features so tests can see the miss
    // eslint-disable-next-line no-console
    console.warn(`[geocoding-stub] unexpected request: ${req.method} ${req.url}`);
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found", path: parsed.pathname }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    port,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
};

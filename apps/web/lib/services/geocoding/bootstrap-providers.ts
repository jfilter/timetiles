/**
 * Bootstrap default free-tier geocoding providers on Payload init.
 *
 * In development/e2e/testing, the seeding scripts populate the collection.
 * Production and staging deployments don't run seeds, so the collection
 * starts empty — and any ingest with a row that needs geocoding fails
 * with `No geocoding providers configured`.
 *
 * This boot-time hook seeds the three free OSM-based providers (Photon
 * via VersaTiles, Photon via Komoot, Nominatim) iff the collection is
 * empty. Operators can disable, reprioritise, or replace them in the
 * dashboard afterwards — re-runs do nothing while at least one provider
 * exists, so manual changes never get clobbered.
 *
 * @module
 * @category Geocoding
 */
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import type { GeocodingProvider } from "@/payload-types";

const logger = createLogger("geocoding-providers-bootstrap");

const COLLECTION = "geocoding-providers" as const;

type SeedProvider = Omit<GeocodingProvider, "id" | "createdAt" | "updatedAt" | "statistics">;

const FREE_TIER_PROVIDERS: SeedProvider[] = [
  {
    name: "Photon (VersaTiles)",
    type: "photon",
    group: "photon",
    enabled: true,
    priority: 1,
    rateLimit: 30,
    baseUrl: "https://geocode.versatiles.org",
    resultLimit: 5,
    tags: ["production", "primary", "free-tier", "region-global"],
    notes:
      "Photon geocoding via VersaTiles - free, OSM-based, no API key required. Tested stable at 50 req/s sustained.",
  },
  {
    name: "Photon (Komoot)",
    type: "photon",
    group: "photon",
    enabled: true,
    priority: 2,
    rateLimit: 10,
    baseUrl: "https://photon.komoot.io",
    resultLimit: 5,
    tags: ["production", "secondary", "free-tier", "region-global"],
    notes:
      "Photon geocoding via Komoot - free, OSM-based, no API key required. Sustained 50 req/s OK, but burst >16 concurrent triggers 404.",
  },
  {
    name: "Nominatim (OpenStreetMap)",
    type: "nominatim",
    enabled: true,
    priority: 3,
    rateLimit: 1,
    baseUrl: "https://nominatim.openstreetmap.org",
    tags: ["production", "backup", "free-tier", "region-global"],
    notes: "OSM Nominatim fallback - free but strict 1 req/s rate limit per usage policy",
  },
];

/**
 * If the geocoding-providers collection is empty, insert the three
 * free OSM providers. Returns the count of providers actually created.
 * Idempotent: a populated collection (any provider, enabled or not)
 * is left untouched.
 */
export const bootstrapDefaultGeocodingProviders = async (payload: Payload): Promise<void> => {
  const existing = await payload.count({ collection: COLLECTION, overrideAccess: true });
  if (existing.totalDocs > 0) {
    return;
  }

  let created = 0;
  for (const seed of FREE_TIER_PROVIDERS) {
    try {
      await payload.create({ collection: COLLECTION, data: seed, overrideAccess: true });
      created += 1;
    } catch (err) {
      logger.error({ err, name: seed.name }, "Failed to bootstrap geocoding provider");
    }
  }

  logger.info({ created }, `Bootstrapped ${created} default free-tier geocoding provider(s)`);
};

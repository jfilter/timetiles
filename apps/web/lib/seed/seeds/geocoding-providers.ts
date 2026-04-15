/**
 * Seed data for the Geocoding Providers collection.
 *
 * Defines predefined geocoding provider configurations that can be used to
 * populate the database with default providers (OSM Nominatim, Google Maps, etc.).
 * This is essential for development and testing as it provides working geocoding
 * capabilities out of the box.
 *
 * @module
 */
import type { GeocodingProvider } from "@/payload-types";

export type GeocodingProviderSeed = Omit<GeocodingProvider, "id" | "createdAt" | "updatedAt" | "statistics">;

export const geocodingProviderSeeds = (environment: string): GeocodingProviderSeed[] => {
  // E2E environment: point at a local stub HTTP server that mocks Photon
  // responses. The stub URL is exported by tests/e2e/global-setup.ts as
  // E2E_GEOCODING_STUB_URL. This keeps the full production geocoding code
  // path (provider selection, HTTP request, response parsing) under test
  // while isolating the suite from external network dependencies.
  if (environment === "e2e") {
    // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E-only env var set by global-setup
    const stubUrl = process.env.E2E_GEOCODING_STUB_URL;
    if (!stubUrl) {
      throw new Error(
        "E2E_GEOCODING_STUB_URL is not set — the stub server must be started before seeding in E2E. See tests/e2e/global-setup.ts."
      );
    }
    return [
      {
        name: "Photon (E2E stub)",
        type: "photon",
        group: "photon",
        enabled: true,
        priority: 1,
        rateLimit: 100,
        baseUrl: `${stubUrl}/photon`,
        resultLimit: 5,
        tags: ["testing", "primary"],
        notes: "Stub Photon server for E2E tests. Not for production use.",
      },
    ];
  }

  const baseProviders: GeocodingProviderSeed[] = [
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

  if (environment === "development") {
    return [
      ...baseProviders,
      {
        name: "Google Maps (Development)",
        type: "google",
        enabled: false,
        priority: 4,
        rateLimit: 50,
        apiKey: "YOUR_API_KEY_HERE",
        language: "en",
        tags: ["development", "secondary", "paid-tier", "region-global", "high-volume"],
        notes: "Google Maps geocoding - configure API key in admin panel to enable",
      },
      {
        name: "OpenCage (Development)",
        type: "opencage",
        enabled: false,
        priority: 5,
        rateLimit: 10,
        apiKey: "YOUR_API_KEY_HERE",
        language: "en",
        tags: ["development", "backup", "paid-tier", "region-global"],
        notes: "OpenCage geocoding - configure API key in admin panel to enable",
      },
      {
        name: "LocationIQ (Development)",
        type: "locationiq",
        enabled: false,
        priority: 6,
        rateLimit: 2,
        apiKey: "YOUR_API_KEY_HERE",
        tags: ["development", "backup", "paid-tier", "region-global"],
        notes: "LocationIQ geocoding - configure API key in admin panel to enable",
      },
    ];
  }

  return baseProviders;
};

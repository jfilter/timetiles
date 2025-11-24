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
  const baseProviders: GeocodingProviderSeed[] = [
    {
      name: "Nominatim (OpenStreetMap)",
      type: "nominatim",
      enabled: true,
      priority: 1,
      rateLimit: 1, // Nominatim public instance has strict rate limits
      config: {
        nominatim: {
          baseUrl: "https://nominatim.openstreetmap.org",
          userAgent: "TimeTiles-App/1.0",
          addressdetails: true,
          extratags: false,
        },
      },
      tags: ["production", "primary", "free-tier", "region-global"],
      notes: "Default OSM Nominatim provider - free public instance with strict rate limiting",
    },
  ];

  if (environment === "development") {
    return [
      ...baseProviders,
      {
        name: "Google Maps (Development)",
        type: "google",
        enabled: false, // Disabled by default until API key is configured in admin panel
        priority: 2,
        rateLimit: 50,
        config: {
          google: {
            apiKey: "YOUR_API_KEY_HERE",
            language: "en",
          },
        },
        tags: ["development", "secondary", "paid-tier", "region-global", "high-volume"],
        notes: "Google Maps geocoding - configure API key in admin panel to enable",
      },
      {
        name: "OpenCage (Development)",
        type: "opencage",
        enabled: false, // Disabled by default until API key is configured in admin panel
        priority: 3,
        rateLimit: 10,
        config: {
          opencage: {
            apiKey: "YOUR_API_KEY_HERE",
            language: "en",
            annotations: true,
            abbrv: false,
          },
        },
        tags: ["development", "backup", "paid-tier", "region-global"],
        notes: "OpenCage geocoding - configure API key in admin panel to enable",
      },
    ];
  }

  return baseProviders;
};

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
      name: "Photon (VersaTiles)",
      type: "photon",
      group: "photon",
      enabled: true,
      priority: 1,
      rateLimit: 30,
      config: { photon: { baseUrl: "https://geocode.versatiles.org", limit: 5 } },
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
      config: { photon: { baseUrl: "https://photon.komoot.io", limit: 5 } },
      tags: ["production", "secondary", "free-tier", "region-global"],
      notes:
        "Photon geocoding via Komoot - free, OSM-based, no API key required. Sustained 50 req/s OK, but burst >16 concurrent triggers 404.",
    },
    {
      name: "Nominatim (OpenStreetMap)",
      type: "nominatim",
      enabled: true,
      priority: 3,
      rateLimit: 1, // Nominatim public instance: max 1 req/s per OSM usage policy
      config: {
        nominatim: {
          baseUrl: "https://nominatim.openstreetmap.org",
          userAgent: "TimeTiles-App/1.0",
          addressdetails: true,
          extratags: false,
        },
      },
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
        config: { google: { apiKey: "YOUR_API_KEY_HERE", language: "en" } },
        tags: ["development", "secondary", "paid-tier", "region-global", "high-volume"],
        notes: "Google Maps geocoding - configure API key in admin panel to enable",
      },
      {
        name: "OpenCage (Development)",
        type: "opencage",
        enabled: false,
        priority: 5,
        rateLimit: 10,
        config: { opencage: { apiKey: "YOUR_API_KEY_HERE", language: "en", annotations: true, abbrv: false } },
        tags: ["development", "backup", "paid-tier", "region-global"],
        notes: "OpenCage geocoding - configure API key in admin panel to enable",
      },
      {
        name: "LocationIQ (Development)",
        type: "locationiq",
        enabled: false,
        priority: 6,
        rateLimit: 2,
        config: { locationiq: { apiKey: "YOUR_API_KEY_HERE" } },
        tags: ["development", "backup", "paid-tier", "region-global"],
        notes: "LocationIQ geocoding - configure API key in admin panel to enable",
      },
    ];
  }

  return baseProviders;
};

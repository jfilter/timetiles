/**
 * This file contains the seed data for the Catalogs collection.
 *
 * It defines a set of predefined catalog entries that can be used to populate the database
 * for different environments (e.g., development, testing). This ensures a consistent and
 * realistic set of high-level data categories is available for organizing datasets.
 *
 * @module
 */
import type { Catalog } from "@/payload-types";

// Use Payload type with specific omissions for seed data
export type CatalogSeed = Omit<Catalog, "id" | "createdAt" | "updatedAt">;

// Helper function to create rich text description
const createDescription = (text: string) => ({
  root: {
    type: "root",
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          {
            type: "text",
            text,
            version: 1,
          },
        ],
      },
    ],
    direction: "ltr" as const,
    format: "" as const,
    indent: 0,
    version: 1,
  },
});

// Helper function to create catalog entry
const createCatalog = (
  name: string,
  description: string,
  slug: string,
  isPublic: boolean = true,
  status: "draft" | "published" = "published"
): CatalogSeed => ({
  name,
  description: createDescription(description),
  slug,
  isPublic,
  _status: status,
});

// Base catalogs shared across all environments
const getBaseCatalogs = (): CatalogSeed[] => [
  createCatalog(
    "Environmental Data",
    "Federal collection of environmental monitoring data including air quality, water quality, and climate measurements from EPA and NOAA stations.",
    "environmental-data",
    true // Public catalog
  ),
  createCatalog(
    "Economic Indicators",
    "Key economic indicators including GDP, unemployment rates, inflation, and market indices.",
    "economic-indicators",
    true // Public catalog
  ),
  createCatalog(
    "Academic Research Portal",
    "University research data from various academic institutions, including scientific studies and experimental results.",
    "academic-research-portal",
    true // Public catalog
  ),
];

// E2E-specific catalogs (adds 5 more to base 3 = 8 total)
const getE2EExtraCatalogs = (): CatalogSeed[] => [
  createCatalog(
    "Cultural Events",
    "Cultural and community events including festivals, performances, and public activities.",
    "cultural-events",
    true // Public catalog
  ),
  createCatalog(
    "Government Data",
    "Public data from government agencies and departments.",
    "government-data",
    true // Public catalog
  ),
  createCatalog(
    "Community Events Portal",
    "Local community events and activities data maintained by community organizations.",
    "community-events-portal",
    true // Public catalog
  ),
  createCatalog(
    "Cultural Heritage Archives",
    "Arts and cultural events data including performances, exhibitions, and cultural activities.",
    "cultural-heritage-archives",
    true // Public catalog
  ),
  createCatalog(
    "Historical Records",
    "Archived historical data that is no longer actively maintained.",
    "historical-records",
    false, // Private catalog
    "draft"
  ),
];

// Development-specific additional catalogs (adds 4 more beyond e2e)
const getDevelopmentExtraCatalogs = (): CatalogSeed[] => [
  createCatalog(
    "Health & Medical Data",
    "Public health statistics and medical research data.",
    "health-medical-data",
    true
  ),
  createCatalog(
    "Transportation Data",
    "Transit, traffic, and transportation infrastructure data.",
    "transportation-data",
    true
  ),
  createCatalog(
    "Education Statistics",
    "Educational institutions and student performance data.",
    "education-statistics",
    true
  ),
  createCatalog("Urban Planning", "City planning, zoning, and development projects data.", "urban-planning", true),
];

export const catalogSeeds = (environment: string): CatalogSeed[] => {
  const baseCatalogs = getBaseCatalogs();

  // E2E uses a consistent set of 8 catalogs for testing
  if (environment === "e2e") {
    return [...baseCatalogs, ...getE2EExtraCatalogs()];
  }

  // Development has an expanded set with additional catalogs
  if (environment === "development") {
    return [...baseCatalogs, ...getE2EExtraCatalogs(), ...getDevelopmentExtraCatalogs()];
  }

  return baseCatalogs;
};

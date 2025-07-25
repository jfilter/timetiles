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
  status: "active" | "archived" = "active",
): CatalogSeed => ({
  name,
  description: createDescription(description),
  slug,
  status,
});

export const catalogSeeds = (environment: string): CatalogSeed[] => {
  const baseCatalogs: CatalogSeed[] = [
    createCatalog(
      "Environmental Data",
      "Federal collection of environmental monitoring data including air quality, water quality, and climate measurements from EPA and NOAA stations.",
      "environmental-data",
    ),
    createCatalog(
      "Economic Indicators",
      "Key economic indicators including GDP, unemployment rates, inflation, and market indices.",
      "economic-indicators",
    ),
    createCatalog(
      "Academic Research Portal",
      "University research data from various academic institutions, including scientific studies and experimental results.",
      "academic-research-portal",
    ),
  ];

  if (environment === "development") {
    return [
      ...baseCatalogs,
      createCatalog(
        "Community Events Portal",
        "Local community events and activities data maintained by community organizations.",
        "community-events-portal",
      ),
      createCatalog(
        "Cultural Heritage Archives",
        "Arts and cultural events data including performances, exhibitions, and cultural activities.",
        "cultural-heritage-archives",
      ),
      createCatalog(
        "Historical Records",
        "Archived historical data that is no longer actively maintained.",
        "historical-records",
        "archived",
      ),
    ];
  }

  return baseCatalogs;
};

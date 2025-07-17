import type { Catalog } from "../../../payload-types";

// Use Payload type with specific omissions for seed data
export type CatalogSeed = Omit<Catalog, "id" | "createdAt" | "updatedAt">;

export function catalogSeeds(environment: string): CatalogSeed[] {
  const baseCatalogs: CatalogSeed[] = [
    // Keep the old name for backward compatibility with tests
    {
      name: "Environmental Data",
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [
                {
                  type: "text",
                  text: "Federal collection of environmental monitoring data including air quality, water quality, and climate measurements from EPA and NOAA stations.",
                  version: 1,
                },
              ],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      slug: "environmental-data",
      status: "active",
    },
    {
      name: "Economic Indicators",
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [
                {
                  type: "text",
                  text: "Key economic indicators including GDP, unemployment rates, inflation, and market indices.",
                  version: 1,
                },
              ],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      slug: "economic-indicators",
      status: "active",
    },
    {
      name: "Academic Research Portal",
      description: {
        root: {
          type: "root",
          children: [
            {
              type: "paragraph",
              version: 1,
              children: [
                {
                  type: "text",
                  text: "University research data from various academic institutions, including scientific studies and experimental results.",
                  version: 1,
                },
              ],
            },
          ],
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
        },
      },
      slug: "academic-research-portal",
      status: "active",
    },
  ];

  if (environment === "development") {
    return [
      ...baseCatalogs,
      {
        name: "Community Events Portal",
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Local community events and activities data maintained by community organizations.",
                    version: 1,
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
        slug: "community-events-portal",
        status: "active",
      },
      {
        name: "Cultural Heritage Archives",
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Arts and cultural events data including performances, exhibitions, and cultural activities.",
                    version: 1,
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
        slug: "cultural-heritage-archives",
        status: "active",
      },
      {
        name: "Historical Records",
        description: {
          root: {
            type: "root",
            children: [
              {
                type: "paragraph",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "Archived historical data that is no longer actively maintained.",
                    version: 1,
                  },
                ],
              },
            ],
            direction: "ltr",
            format: "",
            indent: 0,
            version: 1,
          },
        },
        slug: "historical-records",
        status: "archived",
      },
    ];
  }

  return baseCatalogs;
}

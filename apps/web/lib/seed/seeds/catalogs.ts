import type { Catalog } from "../../../payload-types";

// Use Payload type with specific omissions for seed data
export type CatalogSeed = Omit<Catalog, 'id' | 'createdAt' | 'updatedAt'>;

export function catalogSeeds(environment: string): CatalogSeed[] {
  const baseCatalogs: CatalogSeed[] = [
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
                  text: "Collection of environmental monitoring data including air quality, water quality, and climate measurements.",
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
  ];

  if (environment === "test") {
    return [
      ...baseCatalogs,
      {
        name: "Test Catalog",
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
                    text: "A test catalog for automated testing purposes.",
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
        slug: "test-catalog",
        status: "active",
      },
    ];
  }

  if (environment === "development") {
    return [
      ...baseCatalogs,
      {
        name: "Social Media Analytics",
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
                    text: "Data from various social media platforms including engagement metrics, sentiment analysis, and user demographics.",
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
        slug: "social-media-analytics",
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

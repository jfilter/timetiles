import type { Dataset } from "../../../payload-types";

// Use Payload type with specific modifications for seed data
export type DatasetSeed = Omit<Dataset, 'id' | 'createdAt' | 'updatedAt' | 'catalog'> & {
  catalog: string; // This will be resolved to catalog ID during seeding
};

export function datasetSeeds(environment: string): DatasetSeed[] {
  const baseDatasets: DatasetSeed[] = [
    {
      name: "Air Quality Measurements",
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
                  text: "Real-time air quality measurements from monitoring stations across the city.",
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
      slug: "air-quality-measurements",
      catalog: "environmental-data",
      language: "eng",
      status: "active",
      isPublic: true,
      schema: {
        type: "object",
        properties: {
          station_id: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          pm25: { type: "number" },
          pm10: { type: "number" },
          o3: { type: "number" },
          no2: { type: "number" },
          location: {
            type: "object",
            properties: {
              lat: { type: "number" },
              lng: { type: "number" },
            },
          },
        },
        required: ["station_id", "timestamp"],
      },
      metadata: {
        update_frequency: "hourly",
        data_source: "Environmental Agency",
        units: {
          pm25: "μg/m³",
          pm10: "μg/m³",
          o3: "ppb",
          no2: "ppb",
        },
      },
    },
    {
      name: "GDP Growth Rates",
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
                  text: "Quarterly GDP growth rates by country and region.",
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
      slug: "gdp-growth-rates",
      catalog: "economic-indicators",
      language: "eng",
      status: "active",
      isPublic: true,
      schema: {
        type: "object",
        properties: {
          country: { type: "string" },
          region: { type: "string" },
          year: { type: "integer" },
          quarter: { type: "integer", minimum: 1, maximum: 4 },
          gdp_growth_rate: { type: "number" },
          gdp_nominal: { type: "number" },
          currency: { type: "string" },
        },
        required: ["country", "year", "quarter", "gdp_growth_rate"],
      },
      metadata: {
        update_frequency: "quarterly",
        data_source: "World Bank",
        units: {
          gdp_growth_rate: "percentage",
          gdp_nominal: "USD millions",
        },
      },
    },
  ];

  if (environment === "test") {
    return [
      ...baseDatasets,
      {
        name: "Test Dataset",
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
                    text: "A simple test dataset for automated testing.",
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
        slug: "test-dataset",
        catalog: "test-catalog",
        language: "eng",
        status: "active",
        isPublic: false,
        schema: {
          type: "object",
          properties: {
            id: { type: "string" },
            value: { type: "number" },
          },
        },
      },
    ];
  }

  if (environment === "development") {
    return [
      ...baseDatasets,
      {
        name: "Social Media Engagement",
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
                    text: "Daily engagement metrics from social media platforms.",
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
        slug: "social-media-engagement",
        catalog: "social-media-analytics",
        language: "eng",
        status: "active",
        isPublic: false,
        schema: {
          type: "object",
          properties: {
            platform: { type: "string" },
            date: { type: "string", format: "date" },
            likes: { type: "integer" },
            shares: { type: "integer" },
            comments: { type: "integer" },
            impressions: { type: "integer" },
          },
        },
        metadata: {
          update_frequency: "daily",
          platforms: ["twitter", "facebook", "instagram", "linkedin"],
        },
      },
      {
        name: "Historical Weather Data",
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
                    text: "Historical weather data that is no longer actively maintained.",
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
        slug: "historical-weather-data",
        catalog: "historical-records",
        language: "eng",
        status: "archived",
        isPublic: true,
        schema: {
          type: "object",
          properties: {
            date: { type: "string", format: "date" },
            temperature: { type: "number" },
            humidity: { type: "number" },
            precipitation: { type: "number" },
          },
        },
        metadata: {
          data_period: "1990-2020",
          status: "archived",
        },
      },
    ];
  }

  return baseDatasets;
}

/**
 * @module This file contains the seed data for the Datasets collection.
 *
 * It defines a set of predefined dataset entries that are organized under the catalogs
 * created in `catalogs.ts`. The data is generated programmatically based on templates
 * to ensure a realistic and consistent set of datasets for different environments.
 * This approach allows for easy scaling and variation of the seed data.
 */
import type { Dataset } from "@/payload-types";

import { DATASET_SCHEMAS, getDatasetsPerCatalog, getSchemaTypeForCatalog } from "./utils";

// Use Payload type with specific modifications for seed data
export type DatasetSeed = Omit<Dataset, "id" | "createdAt" | "updatedAt" | "catalog"> & {
  catalog: string; // This will be resolved to catalog ID during seeding
};

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

// Dataset templates for different catalog types
const DATASET_TEMPLATES = {
  environmental: [
    {
      name: "Air Quality Measurements",
      description: "Real-time air quality measurements from monitoring stations",
      slug: "air-quality-measurements",
    },
    {
      name: "Water Quality Assessments",
      description: "Water quality data from rivers, lakes, and coastal areas",
      slug: "water-quality-assessments",
    },
    {
      name: "Climate Station Data",
      description: "Temperature, precipitation, and weather data from climate stations",
      slug: "climate-station-data",
    },
  ],
  economic: [
    {
      name: "GDP Growth Rates",
      description: "Quarterly GDP growth rates by country and region",
      slug: "gdp-growth-rates",
    },
    {
      name: "Employment Statistics",
      description: "Unemployment rates and job market indicators",
      slug: "employment-statistics",
    },
    {
      name: "Consumer Price Index",
      description: "Inflation data and consumer price indices",
      slug: "consumer-price-index",
    },
  ],
  academic: [
    {
      name: "Research Study Results",
      description: "Published research findings and experimental data",
      slug: "research-study-results",
    },
    {
      name: "Survey Response Data",
      description: "Anonymized survey responses from academic studies",
      slug: "survey-response-data",
    },
  ],
  community: [
    {
      name: "Local Events Calendar",
      description: "Community events, meetings, and activities",
      slug: "local-events-calendar",
    },
  ],
  cultural: [
    {
      name: "Performance Schedule",
      description: "Theater, music, and arts performance schedules",
      slug: "performance-schedule",
    },
    {
      name: "Exhibition Archive",
      description: "Museum and gallery exhibition records",
      slug: "exhibition-archive",
    },
  ],
};

// Get catalog configurations
const getCatalogConfigs = (environment: string) => {
  const baseCatalogs = [
    { slug: "environmental-data", type: "environmental" },
    { slug: "economic-indicators", type: "economic" },
    { slug: "academic-research-portal", type: "academic" },
  ];

  if (environment === "development") {
    baseCatalogs.push(
      { slug: "community-events-portal", type: "community" },
      { slug: "cultural-heritage-archives", type: "cultural" },
      { slug: "historical-records", type: "academic" }, // Treat as academic for schema
    );
  }

  return baseCatalogs;
};

// Create dataset from template
const createDatasetFromTemplate = (
  template: { name: string; description: string; slug: string },
  catalog: { slug: string; type: string },
  schema: { [k: string]: unknown } | null,
  datasetIndex: number,
): DatasetSeed => {
  const isArchived = catalog.slug === "historical-records";

  return {
    name: template.name,
    description: createDescription(template.description),
    slug: `${catalog.slug}-${template.slug}`,
    catalog: catalog.slug,
    language: "eng",
    _status: isArchived ? "draft" : "published",
    isPublic: catalog.type !== "community", // Community datasets are private
    metadata: {
      update_frequency: isArchived ? "none" : getUpdateFrequency(catalog.type),
      data_source: getDataSource(catalog.type),
      catalog_type: catalog.type,
      dataset_index: datasetIndex,
    },
  };
};

export const datasetSeeds = (environment: string): DatasetSeed[] => {
  const catalogs = getCatalogConfigs(environment);
  const datasets: DatasetSeed[] = [];

  catalogs.forEach((catalog, catalogIndex) => {
    const numDatasets = getDatasetsPerCatalog(catalogIndex, catalog.type);
    const templates = DATASET_TEMPLATES[catalog.type as keyof typeof DATASET_TEMPLATES] ?? DATASET_TEMPLATES.academic;
    const schemaType = getSchemaTypeForCatalog(catalog.type);
    const schema = Object.hasOwn(DATASET_SCHEMAS, schemaType) ? DATASET_SCHEMAS[schemaType] : null;

    for (let i = 0; i < numDatasets && i < templates.length; i++) {
      const template = templates[i];
      if (template == null || template == undefined) continue;

      datasets.push(createDatasetFromTemplate(template, catalog, schema, i));
    }
  });

  return datasets;
};

const getUpdateFrequency = (catalogType: string): string => {
  switch (catalogType) {
    case "environmental":
      return "hourly";
    case "economic":
      return "quarterly";
    case "academic":
      return "varies";
    case "community":
      return "daily";
    case "cultural":
      return "weekly";
    default:
      return "monthly";
  }
};

const getDataSource = (catalogType: string): string => {
  switch (catalogType) {
    case "environmental":
      return "EPA and NOAA";
    case "economic":
      return "Bureau of Economic Analysis";
    case "academic":
      return "University Research Centers";
    case "community":
      return "Community Organizations";
    case "cultural":
      return "Arts and Culture Institutions";
    default:
      return "Various Sources";
  }
};

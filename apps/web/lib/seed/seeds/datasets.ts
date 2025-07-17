import type { Dataset } from "../../../payload-types";
import { getDatasetsPerCatalog, DATASET_SCHEMAS, getSchemaTypeForCatalog } from "./utils";

// Use Payload type with specific modifications for seed data
export type DatasetSeed = Omit<
  Dataset,
  "id" | "createdAt" | "updatedAt" | "catalog"
> & {
  catalog: string; // This will be resolved to catalog ID during seeding
};

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

export function datasetSeeds(environment: string): DatasetSeed[] {
  const catalogs = [
    { slug: "environmental-data", type: "environmental" },
    { slug: "economic-indicators", type: "economic" },
    { slug: "academic-research-portal", type: "academic" },
  ];

  if (environment === "development") {
    catalogs.push(
      { slug: "community-events-portal", type: "community" },
      { slug: "cultural-heritage-archives", type: "cultural" },
      { slug: "historical-records", type: "academic" } // Treat as academic for schema
    );
  }

  const datasets: DatasetSeed[] = [];

  catalogs.forEach((catalog, catalogIndex) => {
    const numDatasets = getDatasetsPerCatalog(catalogIndex, catalog.type);
    const templates = DATASET_TEMPLATES[catalog.type as keyof typeof DATASET_TEMPLATES] || DATASET_TEMPLATES.academic;
    const schemaType = getSchemaTypeForCatalog(catalog.type);
    const schema = DATASET_SCHEMAS[schemaType];

    for (let i = 0; i < numDatasets && i < templates.length; i++) {
      const template = templates[i];
      const isArchived = catalog.slug === "historical-records";
      
      datasets.push({
        name: template.name,
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
                    text: template.description,
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
        slug: `${catalog.slug}-${template.slug}`,
        catalog: catalog.slug,
        language: "eng",
        status: isArchived ? "archived" : "active",
        isPublic: catalog.type !== "community", // Community datasets are private
        schema: schema,
        metadata: {
          update_frequency: isArchived ? "none" : getUpdateFrequency(catalog.type),
          data_source: getDataSource(catalog.type),
          catalog_type: catalog.type,
          dataset_index: i,
        },
      });
    }
  });

  return datasets;
}

function getUpdateFrequency(catalogType: string): string {
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
}

function getDataSource(catalogType: string): string {
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
}
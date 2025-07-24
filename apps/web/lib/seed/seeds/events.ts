import {
  getEventsPerDataset,
  generateCoordinate,
  generateMetadata,
  getSchemaTypeForCatalog,
  getRegionForDataset,
} from "./utils";
import type { Event } from "../../../payload-types";

// Use Payload type with specific modifications for seed data
export type EventSeed = Omit<
  Event,
  "id" | "createdAt" | "updatedAt" | "dataset" | "import" | "eventTimestamp"
> & {
  dataset: string; // This will be resolved to dataset ID during seeding
  eventTimestamp: Date; // Use Date object for easier seed data handling
};

export function eventSeeds(environment: string): EventSeed[] {
  const events: EventSeed[] = [];

  // Dataset configurations based on the new dataset structure
  const datasetConfigs = [
    // Environmental datasets
    {
      slug: "environmental-data-air-quality-measurements",
      catalogType: "environmental",
      name: "Air Quality Measurements",
    },
    {
      slug: "environmental-data-water-quality-assessments",
      catalogType: "environmental",
      name: "Water Quality Assessments",
    },
    {
      slug: "environmental-data-climate-station-data",
      catalogType: "environmental",
      name: "Climate Station Data",
    },
    // Economic datasets
    {
      slug: "economic-indicators-gdp-growth-rates",
      catalogType: "economic",
      name: "GDP Growth Rates",
    },
    {
      slug: "economic-indicators-employment-statistics",
      catalogType: "economic",
      name: "Employment Statistics",
    },
    {
      slug: "economic-indicators-consumer-price-index",
      catalogType: "economic",
      name: "Consumer Price Index",
    },
    // Academic datasets
    {
      slug: "academic-research-portal-research-study-results",
      catalogType: "academic",
      name: "Research Study Results",
    },
    {
      slug: "academic-research-portal-survey-response-data",
      catalogType: "academic",
      name: "Survey Response Data",
    },
  ];

  // Add development-only datasets
  if (environment === "development") {
    datasetConfigs.push(
      {
        slug: "community-events-portal-local-events-calendar",
        catalogType: "community",
        name: "Local Events Calendar",
      },
      {
        slug: "cultural-heritage-archives-performance-schedule",
        catalogType: "cultural",
        name: "Performance Schedule",
      },
      {
        slug: "cultural-heritage-archives-exhibition-archive",
        catalogType: "cultural",
        name: "Exhibition Archive",
      },
    );
  }

  // Generate events for each dataset
  datasetConfigs.forEach((config, datasetIndex) => {
    const numEvents = getEventsPerDataset(datasetIndex, config.name);
    const schemaType = getSchemaTypeForCatalog(config.catalogType);
    const region = getRegionForDataset(config.name);

    for (let i = 0; i < numEvents; i++) {
      const eventIndex = events.length;
      const metadata = generateMetadata(schemaType, eventIndex);
      const location = generateCoordinate(region, {
        cluster: true,
        clusterRadius: schemaType === "environmental" ? 0.5 : 0.1,
      });

      // Determine event timestamp based on dataset type
      const eventTimestamp = determineEventTimestamp(
        config.catalogType,
        metadata,
      );

      // For economic data, some events don't need location
      const needsLocation =
        config.catalogType !== "economic" || Math.random() > 0.5;

      events.push({
        dataset: config.slug,
        data: metadata,
        location: needsLocation ? location : undefined,
        eventTimestamp: eventTimestamp,
        isValid: true,
        coordinateSource: needsLocation
          ? {
              type: "import",
              importColumns: {
                latitudeColumn: "latitude",
                longitudeColumn: "longitude",
              },
              validationStatus: "valid",
            }
          : {
              type: "none",
            },
      });
    }
  });

  return events;
}

function determineEventTimestamp(
  catalogType: string,
  metadata: Record<string, unknown>,
): Date {
  if (catalogType === "cultural" && hasValidProperty(metadata, "event_date")) {
    return new Date(metadata.event_date as string);
  }

  if (
    catalogType === "academic" &&
    hasValidProperty(metadata, "publication_date")
  ) {
    return new Date(metadata.publication_date as string);
  }

  if (hasValidProperty(metadata, "timestamp")) {
    return new Date(metadata.timestamp as string);
  }

  if (hasValidProperty(metadata, "reported_date")) {
    return new Date(metadata.reported_date as string);
  }

  // Default: spread events over the past year
  const daysAgo = Math.floor(Math.random() * 365);
  return new Date(Date.now() - daysAgo * 86400000);
}

function hasValidProperty(obj: Record<string, unknown>, key: string): boolean {
  const value = Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
  return value !== null && value !== undefined;
}

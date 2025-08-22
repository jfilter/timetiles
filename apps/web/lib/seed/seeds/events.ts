/**
 * This file contains the seed data for the Events collection.
 *
 * It programmatically generates a large number of event records with realistic and varied
 * data. The generation logic is designed to create events that are associated with the
 * datasets defined in `datasets.ts`, and it uses utility functions to produce plausible
 * metadata, geographic coordinates, and timestamps. This ensures a rich and diverse
 * dataset for development and testing purposes.
 *
 * @module
 */
import type { Event } from "@/payload-types";

import {
  generateCoordinate,
  generateMetadata,
  getEventsPerDataset,
  getRegionForDataset,
  getSchemaTypeForCatalog,
} from "./utils";

// Use Payload type with specific modifications for seed data
export type EventSeed = Omit<Event, "id" | "createdAt" | "updatedAt" | "dataset" | "import" | "eventTimestamp"> & {
  dataset: string; // This will be resolved to dataset ID during seeding
  eventTimestamp: Date; // Use Date object for easier seed data handling
};

// Base dataset configurations
const getBaseDatasetConfigs = () => [
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

// Development-only dataset configurations
const getDevelopmentDatasetConfigs = () => [
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
];

// Get dataset configurations for different environments
const getDatasetConfigs = (environment: string) => {
  const baseConfigs = getBaseDatasetConfigs();
  return environment === "development" ? [...baseConfigs, ...getDevelopmentDatasetConfigs()] : baseConfigs;
};

// Generate events for a single dataset configuration
const generateEventsForDataset = (
  config: { slug: string; catalogType: string; name: string },
  datasetIndex: number,
  currentEventCount: number
): EventSeed[] => {
  const events: EventSeed[] = [];
  const numEvents = getEventsPerDataset(datasetIndex, config.name);
  const schemaType = getSchemaTypeForCatalog(config.catalogType);
  const region = getRegionForDataset(config.name);

  for (let i = 0; i < numEvents; i++) {
    const eventIndex = currentEventCount + i;
    const metadata = generateMetadata(schemaType, eventIndex);
    const location = generateCoordinate(region, {
      cluster: true,
      clusterRadius: schemaType === "environmental" ? 0.5 : 0.1,
    });

    const eventTimestamp = determineEventTimestamp(config.catalogType, metadata);

    // For economic data, some events don't need location
    // Math.random is acceptable here as this is only for test seed data generation
    // eslint-disable-next-line sonarjs/pseudo-random
    const needsLocation = config.catalogType !== "economic" || Math.random() > 0.5;

    events.push({
      uniqueId: `${config.slug}-event-${i}`,
      dataset: config.slug,
      data: metadata,
      location: needsLocation ? location : undefined,
      eventTimestamp: eventTimestamp,
      validationStatus: "valid" as const,
      coordinateSource: needsLocation
        ? {
            type: "import" as const,
            importColumns: {
              latitudeColumn: "latitude",
              longitudeColumn: "longitude",
            },
            validationStatus: "valid" as const,
          }
        : {
            type: "none" as const,
          },
    });
  }

  return events;
};

export const eventSeeds = (environment: string): EventSeed[] => {
  const events: EventSeed[] = [];
  const datasetConfigs = getDatasetConfigs(environment);

  // Generate events for each dataset
  datasetConfigs.forEach((config, datasetIndex) => {
    const datasetEvents = generateEventsForDataset(config, datasetIndex, events.length);
    events.push(...datasetEvents);
  });

  return events;
};

const determineEventTimestamp = (catalogType: string, metadata: Record<string, unknown>): Date => {
  if (catalogType === "cultural" && hasValidProperty(metadata, "event_date")) {
    return new Date(metadata.event_date as string);
  }

  if (catalogType === "academic" && hasValidProperty(metadata, "publication_date")) {
    return new Date(metadata.publication_date as string);
  }

  if (hasValidProperty(metadata, "timestamp")) {
    return new Date(metadata.timestamp as string);
  }

  if (hasValidProperty(metadata, "reported_date")) {
    return new Date(metadata.reported_date as string);
  }

  // Default: spread events over the past year
  // Math.random is acceptable here as this is only for test seed data generation
  // eslint-disable-next-line sonarjs/pseudo-random
  const daysAgo = Math.floor(Math.random() * 365);
  return new Date(Date.now() - daysAgo * 86400000);
};

const hasValidProperty = (obj: Record<string, unknown>, key: string): boolean => {
  const value = Object.hasOwn(obj, key) ? obj[key] : undefined;
  return value != null;
};

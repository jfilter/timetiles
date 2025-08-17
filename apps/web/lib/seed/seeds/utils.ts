/**
 * @module This file contains utility functions for generating realistic and varied seed data.
 *
 * It provides a set of helpers that are used by the individual seed files (e.g., `events.ts`,
 * `datasets.ts`) to create mock data that mimics real-world scenarios. This includes:
 * - Generating plausible geographic coordinates within specific regions.
 * - Creating structured metadata based on different schema types.
 * - Determining the number of items to generate for different collections based on their type.
 * - Providing predefined schemas and geographic regions to ensure consistency.
 */

/**
 * Utility functions for generating realistic seed data
 */

/**
 * Dataset metadata schemas for different catalog types
 */
export const DATASET_SCHEMAS = {
  government: {
    type: "object",
    properties: {
      agency: { type: "string", description: "Government agency name" },
      department: { type: "string", description: "Department or division" },
      contact: { type: "string", description: "Contact email or phone" },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      status: {
        type: "string",
        enum: ["open", "in-progress", "resolved", "closed"],
      },
      reference_number: {
        type: "string",
        description: "Official reference number",
      },
      reported_date: { type: "string", format: "date-time" },
    },
    required: ["agency", "department", "status"],
  },
  environmental: {
    type: "object",
    properties: {
      station_id: {
        type: "string",
        description: "Monitoring station identifier",
      },
      measurement_type: { type: "string", description: "Type of measurement" },
      value: { type: "number", description: "Measured value" },
      unit: { type: "string", description: "Unit of measurement" },
      sensor_id: { type: "string", description: "Sensor identifier" },
      quality: {
        type: "string",
        enum: ["good", "moderate", "poor", "hazardous"],
      },
      conditions: { type: "string", description: "Environmental conditions" },
      timestamp: { type: "string", format: "date-time" },
    },
    required: ["station_id", "measurement_type", "value", "unit", "timestamp"],
  },
  academic: {
    type: "object",
    properties: {
      institution: { type: "string", description: "Academic institution" },
      researcher: { type: "string", description: "Lead researcher name" },
      funding: { type: "string", description: "Funding source" },
      discipline: { type: "string", description: "Academic discipline" },
      keywords: { type: "array", items: { type: "string" } },
      doi: { type: "string", description: "Digital Object Identifier" },
      publication_date: { type: "string", format: "date" },
      sample_size: {
        type: "integer",
        description: "Sample size if applicable",
      },
    },
    required: ["institution", "researcher", "discipline"],
  },
  cultural: {
    type: "object",
    properties: {
      venue: { type: "string", description: "Event venue" },
      performer: { type: "string", description: "Performer or artist name" },
      ticket_price: { type: "number", description: "Ticket price in USD" },
      capacity: { type: "integer", description: "Venue capacity" },
      genre: { type: "string", description: "Genre or category" },
      duration_minutes: { type: "integer", description: "Event duration" },
      age_restriction: { type: "string", description: "Age restrictions" },
      event_date: { type: "string", format: "date-time" },
    },
    required: ["venue", "event_date"],
  },
  economic: {
    type: "object",
    properties: {
      indicator: { type: "string", description: "Economic indicator name" },
      value: { type: "number", description: "Indicator value" },
      unit: { type: "string", description: "Unit of measurement" },
      region: { type: "string", description: "Geographic region" },
      sector: { type: "string", description: "Economic sector" },
      period: { type: "string", description: "Time period" },
      source: { type: "string", description: "Data source" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["indicator", "value", "unit", "region", "period"],
  },
};

/**
 * Geographic regions with realistic coordinate bounds
 */
export const GEOGRAPHIC_REGIONS = {
  "new-york-metro": {
    name: "New York Metropolitan Area",
    bounds: {
      north: 41.1,
      south: 40.4,
      east: -73.5,
      west: -74.3,
    },
    centers: [
      { name: "Manhattan", lat: 40.7831, lng: -73.9712 },
      { name: "Brooklyn", lat: 40.6782, lng: -73.9442 },
      { name: "Queens", lat: 40.7282, lng: -73.7949 },
      { name: "Bronx", lat: 40.8448, lng: -73.8648 },
      { name: "Staten Island", lat: 40.5795, lng: -74.1502 },
    ],
  },
  california: {
    name: "California",
    bounds: {
      north: 42.0,
      south: 32.5,
      east: -114.1,
      west: -124.4,
    },
    centers: [
      { name: "Los Angeles", lat: 34.0522, lng: -118.2437 },
      { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
      { name: "San Diego", lat: 32.7157, lng: -117.1611 },
      { name: "Sacramento", lat: 38.5816, lng: -121.4944 },
      { name: "San Jose", lat: 37.3382, lng: -121.8863 },
    ],
  },
  texas: {
    name: "Texas",
    bounds: {
      north: 36.5,
      south: 25.8,
      east: -93.5,
      west: -106.6,
    },
    centers: [
      { name: "Houston", lat: 29.7604, lng: -95.3698 },
      { name: "Dallas", lat: 32.7767, lng: -96.797 },
      { name: "Austin", lat: 30.2672, lng: -97.7431 },
      { name: "San Antonio", lat: 29.4241, lng: -98.4936 },
      { name: "Fort Worth", lat: 32.7555, lng: -97.3308 },
    ],
  },
  europe: {
    name: "Europe",
    bounds: {
      north: 60.0,
      south: 35.0,
      east: 40.0,
      west: -10.0,
    },
    centers: [
      { name: "London", lat: 51.5074, lng: -0.1278 },
      { name: "Paris", lat: 48.8566, lng: 2.3522 },
      { name: "Berlin", lat: 52.52, lng: 13.405 },
      { name: "Madrid", lat: 40.4168, lng: -3.7038 },
      { name: "Rome", lat: 41.9028, lng: 12.4964 },
    ],
  },
};

/**
 * Generate a random coordinate within bounds with optional clustering
 */
export const generateCoordinate = (
  region: keyof typeof GEOGRAPHIC_REGIONS,
  options: {
    cluster?: boolean;
    clusterRadius?: number; // in degrees
  } = {}
): { latitude: number; longitude: number } => {
  const regionData = GEOGRAPHIC_REGIONS[region];
  const { cluster = true, clusterRadius = 0.1 } = options;

  // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
  if (cluster && Math.random() < 0.7) {
    // 70% chance to cluster around a center
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    const center = regionData.centers[Math.floor(Math.random() * regionData.centers.length)];
    if (center) {
      return {
        // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
        latitude: center.lat + (Math.random() - 0.5) * clusterRadius * 2,
        // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
        longitude: center.lng + (Math.random() - 0.5) * clusterRadius * 2,
      };
    }
  }

  // Random within bounds (fallback)
  return {
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    latitude: regionData.bounds.south + Math.random() * (regionData.bounds.north - regionData.bounds.south),
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    longitude: regionData.bounds.west + Math.random() * (regionData.bounds.east - regionData.bounds.west),
  };
};

/**
 * Determine number of datasets for a catalog based on its type
 */
export const getDatasetsPerCatalog = (catalogIndex: number, catalogType: string): number => {
  // Deterministic but varied distribution
  if (catalogType.includes("government") || catalogType.includes("federal") || catalogType.includes("environmental")) {
    return 3; // Government/Environmental catalogs are comprehensive
  } else if (catalogType.includes("academic") || catalogType.includes("research")) {
    return 2; // Academic catalogs are focused
  } else if (catalogType.includes("community") || catalogType.includes("local")) {
    return 1; // Community catalogs are single-purpose
  } else if (catalogType.includes("cultural")) {
    return 2; // Cultural catalogs have moderate scope
  } else if (catalogType.includes("economic")) {
    return 3; // Economic catalogs are comprehensive
  } else {
    // Default pattern: 1, 2, 3, 1, 2, 3...
    return (catalogIndex % 3) + 1;
  }
};

/**
 * Determine number of events for a dataset based on its characteristics
 */
export const getEventsPerDataset = (datasetIndex: number, datasetName: string): number => {
  const name = datasetName.toLowerCase();

  // Large datasets (national/state level)
  if (name.includes("national") || name.includes("federal") || name.includes("state")) {
    return 50 + ((datasetIndex * 10) % 51); // 50-100 events
  }
  // Medium datasets (city/regional)
  else if (name.includes("city") || name.includes("regional") || name.includes("metropolitan")) {
    return 20 + ((datasetIndex * 5) % 31); // 20-50 events
  }
  // Small datasets (local/specialized)
  else if (name.includes("local") || name.includes("community") || name.includes("pilot")) {
    return 5 + ((datasetIndex * 3) % 16); // 5-20 events
  }
  // Default: use a deterministic formula
  else {
    return 5 + ((datasetIndex * 15) % 96); // 5-100 events
  }
};

/**
 * Generate government metadata
 */
const generateGovernmentMetadata = (index: number): Record<string, unknown> => {
  const agencies = ["EPA", "DOT", "HUD", "CDC", "FEMA"];
  const departments = ["Operations", "Compliance", "Research", "Public Affairs", "Emergency Response"];
  const statuses = ["open", "in-progress", "resolved", "closed"];
  const severities = ["low", "medium", "high", "critical"];

  return {
    agency: agencies[index % agencies.length],
    department: departments[(index + 1) % departments.length],
    contact: `contact-${index}@agency.gov`,
    severity: severities[index % severities.length],
    status: statuses[index % statuses.length],
    reference_number: `REF-2024-${String(index + 1000).padStart(5, "0")}`,
    reported_date: new Date(Date.now() - index * 86400000).toISOString(), // Days ago
  };
};

/**
 * Generate environmental metadata
 */
const generateEnvironmentalMetadata = (index: number): Record<string, unknown> => {
  const measurements = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO"];
  const units = ["μg/m³", "ppb", "ppm", "mg/m³"];
  const qualities = ["good", "moderate", "poor", "hazardous"];

  return {
    station_id: `ENV-${String(index + 100).padStart(3, "0")}`,
    measurement_type: measurements[index % measurements.length],
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    value: Math.round(Math.random() * 100 * 10) / 10,
    unit: units[index % units.length],
    sensor_id: `SENSOR-${index + 1000}`,
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    quality: qualities[Math.floor(Math.random() * qualities.length)],
    conditions: ["Clear", "Cloudy", "Rainy", "Foggy"][index % 4],
    timestamp: new Date(Date.now() - index * 3600000).toISOString(), // Hours ago
  };
};

/**
 * Generate academic metadata
 */
const generateAcademicMetadata = (index: number): Record<string, unknown> => {
  const institutions = ["MIT", "Stanford", "Harvard", "Yale", "Princeton"];
  const disciplines = ["Computer Science", "Biology", "Physics", "Economics", "Psychology"];
  const funders = ["NSF", "NIH", "DOE", "NASA", "Private Foundation"];

  return {
    institution: institutions[index % institutions.length],
    researcher: `Dr. ${["Smith", "Johnson", "Williams", "Brown", "Jones"][index % 5]}`,
    funding: funders[index % funders.length],
    discipline: disciplines[index % disciplines.length],
    keywords: ["research", disciplines[index % disciplines.length]?.toLowerCase() ?? "unknown", "study"],
    doi: `10.1234/example.${index + 1000}`,
    publication_date: new Date(Date.now() - index * 86400000).toISOString().split("T")[0],
    sample_size: 100 + index * 50,
  };
};

/**
 * Generate cultural metadata
 */
const generateCulturalMetadata = (index: number): Record<string, unknown> => {
  const venues = ["City Theater", "Music Hall", "Art Gallery", "Convention Center", "Stadium"];
  const genres = ["Rock", "Classical", "Jazz", "Pop", "Electronic"];

  return {
    venue: venues[index % venues.length],
    performer: `Artist ${index + 1}`,
    ticket_price: 25 + (index % 10) * 5,
    capacity: 500 + (index % 10) * 100,
    genre: genres[index % genres.length],
    duration_minutes: 90 + (index % 6) * 30,
    age_restriction: index % 3 === 0 ? "21+" : "All Ages",
    event_date: new Date(Date.now() + index * 86400000).toISOString(), // Days in future
  };
};

/**
 * Generate economic metadata
 */
const generateEconomicMetadata = (index: number): Record<string, unknown> => {
  const indicators = ["GDP", "Unemployment", "Inflation", "Trade Balance", "Consumer Confidence"];
  const regions = ["North America", "Europe", "Asia", "South America", "Africa"];
  const sectors = ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail"];

  return {
    indicator: indicators[index % indicators.length],
    // eslint-disable-next-line sonarjs/pseudo-random -- Safe for seed data generation
    value: Math.round(Math.random() * 1000) / 10,
    unit: "%",
    region: regions[index % regions.length],
    sector: sectors[index % sectors.length],
    period: `Q${(index % 4) + 1} 2024`,
    source: "Economic Research Bureau",
    confidence: ["high", "medium", "low"][index % 3],
  };
};

/**
 * Generate metadata based on schema type
 */
export const generateMetadata = (schemaType: keyof typeof DATASET_SCHEMAS, index: number): Record<string, unknown> => {
  switch (schemaType) {
    case "government":
      return generateGovernmentMetadata(index);
    case "environmental":
      return generateEnvironmentalMetadata(index);
    case "academic":
      return generateAcademicMetadata(index);
    case "cultural":
      return generateCulturalMetadata(index);
    case "economic":
      return generateEconomicMetadata(index);
    default:
      return {};
  }
};

/**
 * Get the appropriate schema type for a catalog
 */
export const getSchemaTypeForCatalog = (catalogName: string): keyof typeof DATASET_SCHEMAS => {
  const name = catalogName.toLowerCase();

  const schemaMapping = [
    { keywords: ["environmental", "climate", "weather"], type: "environmental" as const },
    { keywords: ["economic", "financial", "market"], type: "economic" as const },
    { keywords: ["academic", "research", "university"], type: "academic" as const },
    { keywords: ["cultural", "arts", "entertainment"], type: "cultural" as const },
    { keywords: ["government", "federal", "municipal"], type: "government" as const },
  ];

  const matchedSchema = schemaMapping.find(({ keywords }) => keywords.some((keyword) => name.includes(keyword)));

  return matchedSchema?.type ?? "government";
};

/**
 * Get geographic region for a dataset
 */
export const getRegionForDataset = (datasetName: string): keyof typeof GEOGRAPHIC_REGIONS => {
  const name = datasetName.toLowerCase();

  if (name.includes("california") || name.includes("west coast") || name.includes("pacific")) {
    return "california";
  } else if (name.includes("texas") || name.includes("southwest") || name.includes("gulf")) {
    return "texas";
  } else if (name.includes("europe") || name.includes("eu") || name.includes("european")) {
    return "europe";
  } else if (name.includes("new york") || name.includes("northeast") || name.includes("atlantic")) {
    return "new-york-metro";
  }

  // Default to New York metro area
  return "new-york-metro";
};

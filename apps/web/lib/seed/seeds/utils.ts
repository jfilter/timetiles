/**
 * This file contains utility functions for generating realistic and varied seed data.
 *
 * It provides a set of helpers that are used by the individual seed files (e.g., `events.ts`,
 * `datasets.ts`) to create mock data that mimics real-world scenarios. This includes:
 * - Generating plausible geographic coordinates within specific regions.
 * - Creating structured metadata based on different schema types.
 * - Determining the number of items to generate for different collections based on their type.
 * - Providing predefined schemas and geographic regions to ensure consistency.
 *
 * Note: This file exceeds the standard line limit because it contains extensive
 * seed data definitions that are more maintainable when co-located. Rules are disabled
 * via eslint.config.js for seed files.
 *
 * @module
 */

/**
 * Utility functions for generating realistic seed data.
 */

/**
 * Dataset metadata schemas for different catalog types.
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
 * Geographic regions with realistic coordinate bounds.
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
 * Categories for each schema type.
 */
export const CATEGORIES = {
  government: ["Compliance", "Safety", "Infrastructure", "Public Health", "Emergency"],
  environmental: ["Air Quality", "Water Quality", "Soil", "Noise", "Radiation"],
  academic: ["Study", "Survey", "Meta-Analysis", "Clinical Trial", "Review"],
  cultural: ["Concert", "Exhibition", "Theater", "Festival", "Workshop"],
  economic: ["Report", "Forecast", "Analysis", "Index", "Survey"],
};

/**
 * Tags for each schema type.
 */
export const TAGS = {
  government: [
    "urgent",
    "federal",
    "state",
    "local",
    "compliance",
    "safety",
    "environmental",
    "health",
    "regulatory",
    "audit",
  ],
  environmental: [
    "outdoor",
    "indoor",
    "urban",
    "rural",
    "industrial",
    "residential",
    "monitoring",
    "alert",
    "seasonal",
    "baseline",
  ],
  academic: [
    "peer-reviewed",
    "preprint",
    "longitudinal",
    "cross-sectional",
    "experimental",
    "observational",
    "replication",
    "open-access",
  ],
  cultural: [
    "outdoor",
    "indoor",
    "family-friendly",
    "free",
    "ticketed",
    "accessible",
    "premiere",
    "limited-seating",
    "livestream",
  ],
  economic: [
    "quarterly",
    "annual",
    "national",
    "regional",
    "preliminary",
    "revised",
    "final",
    "benchmark",
    "seasonally-adjusted",
  ],
};

/**
 * Pick random items from an array.
 */
const pickRandom = <T>(arr: T[], count: number): T[] => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

/**
 * Generate a deterministic priority (1-5) based on index.
 */
const generatePriority = (index: number): number => (index % 5) + 1;

/**
 * Generate a deterministic rating (0.0-5.0) based on index.
 */
const generateRating = (index: number): number => Math.round(((index * 7) % 50) / 10 + 0.5) / 1;

/**
 * Generate a deterministic count based on index and multiplier.
 */
const generateCount = (index: number, multiplier: number): number => 10 + ((index * multiplier) % 9990);

/**
 * Generate a random coordinate within bounds with optional clustering.
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

  if (cluster && Math.random() < 0.7) {
    // 70% chance to cluster around a center

    const center = regionData.centers[Math.floor(Math.random() * regionData.centers.length)];
    if (center) {
      return {
        latitude: center.lat + (Math.random() - 0.5) * clusterRadius * 2,

        longitude: center.lng + (Math.random() - 0.5) * clusterRadius * 2,
      };
    }
  }

  // Random within bounds (fallback)
  return {
    latitude: regionData.bounds.south + Math.random() * (regionData.bounds.north - regionData.bounds.south),

    longitude: regionData.bounds.west + Math.random() * (regionData.bounds.east - regionData.bounds.west),
  };
};

/**
 * Determine number of datasets for a catalog based on its type.
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
 * Determine number of events for a dataset based on its characteristics.
 * All datasets get at least 3 events, with a cap of 10 for smaller/newer datasets.
 */
export const getEventsPerDataset = (datasetIndex: number, datasetName: string): number => {
  const name = datasetName.toLowerCase();

  // Large datasets (national/state level) - existing datasets with many events
  if (name.includes("national") || name.includes("federal") || name.includes("state")) {
    return 50 + ((datasetIndex * 10) % 51); // 50-100 events
  }
  // Medium datasets (city/regional)
  else if (name.includes("city") || name.includes("regional") || name.includes("metropolitan")) {
    return 20 + ((datasetIndex * 5) % 31); // 20-50 events
  }
  // Small datasets (local/specialized) - 3-10 events
  else if (name.includes("local") || name.includes("community") || name.includes("pilot")) {
    return 3 + ((datasetIndex * 2) % 8); // 3-10 events
  }
  // Default for all other datasets: 3-10 events (minimum 3, max 10)
  else {
    return 3 + ((datasetIndex * 3) % 8); // 3-10 events
  }
};

/**
 * Generate government metadata.
 */
const generateGovernmentMetadata = (index: number): Record<string, unknown> => {
  const agencies = ["EPA", "DOT", "HUD", "CDC", "FEMA"];
  const departments = ["Operations", "Compliance", "Research", "Public Affairs", "Emergency Response"];
  const statuses = ["open", "in-progress", "resolved", "closed"];
  const severities = ["low", "medium", "high", "critical"];
  const findings = [
    "Initial assessment indicates compliance with federal standards.",
    "Field inspections revealed areas requiring immediate attention.",
    "Documentation review completed with minor discrepancies noted.",
    "Site conditions meet current regulatory requirements.",
    "Follow-up inspection scheduled pending corrective action verification.",
  ];
  const nextSteps = [
    "Stakeholder notifications have been distributed to all affected parties.",
    "Technical review committee will convene within the next reporting period.",
    "Updated guidelines will be published following the comment period.",
    "Regional offices have been briefed on implementation protocols.",
    "Public comment period opens next month for community input.",
  ];
  const impacts = [
    "This report affects approximately 50,000 residents in the service area.",
    "Estimated economic impact ranges from $1M to $5M over the fiscal year.",
    "Environmental remediation efforts are expected to span 18-24 months.",
    "Coordination with state agencies has been initiated to ensure compliance.",
    "Budget allocation requests have been submitted for the upcoming cycle.",
  ];

  const agency = agencies[index % agencies.length];
  const department = departments[(index + 1) % departments.length];
  const status = statuses[index % statuses.length];
  const severity = severities[index % severities.length];
  const reference = `REF-2024-${String(index + 1000).padStart(5, "0")}`;
  const category = CATEGORIES.government[index % CATEGORIES.government.length] ?? "Compliance";

  const tags = pickRandom(TAGS.government, 2 + Math.floor(Math.random() * 3));

  const description = [
    `Official ${status} report from ${agency} ${department} regarding ${category.toLowerCase()} matters.`,
    findings[index % findings.length],
    `Current severity level is classified as ${severity}, requiring ${severity === "critical" ? "immediate" : "standard"} response protocols.`,
    impacts[(index + 2) % impacts.length],
    nextSteps[(index + 1) % nextSteps.length],
    `For questions or concerns, contact the ${department} division at the provided contact information.`,
  ].join(" ");

  return {
    title: `${agency} ${department} Report ${reference}`,
    description,
    startDate: new Date(Date.now() - index * 86400000).toISOString(),
    agency,
    department,
    contact: `contact-${index}@agency.gov`,
    severity,
    status,
    reference_number: reference,
    reported_date: new Date(Date.now() - index * 86400000).toISOString(),
    category,
    tags,
    priority: generatePriority(index),
    rating: generateRating(index),
    views: generateCount(index, 17),
  };
};

/**
 * Generate environmental metadata.
 */
const generateEnvironmentalMetadata = (index: number): Record<string, unknown> => {
  const measurements = ["PM2.5", "PM10", "NO2", "O3", "SO2", "CO"];
  const units = ["μg/m³", "ppb", "ppm", "mg/m³"];
  const qualities = ["good", "moderate", "poor", "hazardous"];
  const weatherConditions = ["Clear", "Cloudy", "Rainy", "Foggy"];
  const healthImplications = [
    "Current levels are within safe limits for outdoor activities.",
    "Sensitive groups should consider limiting prolonged outdoor exposure.",
    "General population may experience minor respiratory irritation.",
    "All individuals should avoid extended outdoor activities.",
  ];
  const historicalComparisons = [
    "This reading is consistent with seasonal averages for the region.",
    "Values are approximately 15% lower than the same period last year.",
    "Measurements show a slight increase compared to the weekly baseline.",
    "Data indicates improvement following recent weather patterns.",
  ];
  const sensorNotes = [
    "Sensor calibration was verified within the last 30 days.",
    "Equipment is operating within normal parameters.",
    "Data quality has been validated against reference monitors.",
    "Continuous monitoring ensures real-time accuracy of readings.",
  ];

  const measurement = measurements[index % measurements.length];

  const value = Math.round(Math.random() * 100 * 10) / 10;
  const unit = units[index % units.length];

  const quality = qualities[Math.floor(Math.random() * qualities.length)] ?? "good";
  const qualityIndex = qualities.indexOf(quality);
  const timestamp = new Date(Date.now() - index * 3600000).toISOString();
  const conditions = weatherConditions[index % weatherConditions.length] ?? "Clear";
  const category = CATEGORIES.environmental[index % CATEGORIES.environmental.length] ?? "Air Quality";

  const tags = pickRandom(TAGS.environmental, 2 + Math.floor(Math.random() * 3));

  const description = [
    `Environmental sensor reading for ${measurement} recorded at station ENV-${String(index + 100).padStart(3, "0")}.`,
    `Current conditions show ${quality} ${category.toLowerCase()} with a measured value of ${value}${unit}.`,
    `Weather conditions at time of reading: ${conditions}.`,
    healthImplications[qualityIndex] ?? healthImplications[0] ?? "Current levels are within safe limits.",
    historicalComparisons[index % historicalComparisons.length],
    sensorNotes[(index + 1) % sensorNotes.length],
  ].join(" ");

  return {
    title: `${measurement} Reading: ${value}${unit}`,
    description,
    startDate: timestamp,
    station_id: `ENV-${String(index + 100).padStart(3, "0")}`,
    measurement_type: measurement,
    value,
    unit,
    sensor_id: `SENSOR-${index + 1000}`,
    quality,
    conditions,
    timestamp,
    category,
    tags,
    priority: generatePriority(index),
    rating: generateRating(index),
    views: generateCount(index, 23),
  };
};

/**
 * Generate academic metadata.
 */
const generateAcademicMetadata = (index: number): Record<string, unknown> => {
  const institutions = ["MIT", "Stanford", "Harvard", "Yale", "Princeton"];
  const disciplines = ["Computer Science", "Biology", "Physics", "Economics", "Psychology"];
  const funders = ["NSF", "NIH", "DOE", "NASA", "Private Foundation"];
  const methodologies = [
    "The study employed a randomized controlled trial design with double-blind procedures.",
    "Researchers utilized a mixed-methods approach combining quantitative surveys and qualitative interviews.",
    "Data was collected through longitudinal observation over a 24-month period.",
    "The analysis incorporated machine learning algorithms to identify patterns in large datasets.",
    "A cross-sectional survey design was implemented across multiple demographic groups.",
  ];
  const significances = [
    "These findings contribute significantly to our understanding of fundamental processes in the field.",
    "The results challenge existing theoretical frameworks and suggest new avenues for investigation.",
    "This research addresses critical gaps in the current literature and provides actionable insights.",
    "The study outcomes have direct implications for policy development and practical applications.",
    "Findings demonstrate reproducibility of earlier work while extending the scope of inquiry.",
  ];
  const implications = [
    "Future research should explore the boundary conditions identified in this work.",
    "The methodological innovations presented here can be applied to related domains.",
    "Practitioners can leverage these findings to improve outcomes in applied settings.",
    "The data and materials have been made available for replication and extension studies.",
    "Collaboration opportunities exist for researchers interested in building on this foundation.",
  ];

  const institution = institutions[index % institutions.length];
  const discipline = disciplines[index % disciplines.length];
  const researcher = `Dr. ${["Smith", "Johnson", "Williams", "Brown", "Jones"][index % 5]}`;
  const pubDate = new Date(Date.now() - index * 86400000).toISOString().split("T")[0];
  const funding = funders[index % funders.length];
  const sampleSize = 100 + index * 50;
  const category = CATEGORIES.academic[index % CATEGORIES.academic.length] ?? "Study";

  const tags = pickRandom(TAGS.academic, 2 + Math.floor(Math.random() * 3));

  const description = [
    `New findings in ${discipline} led by ${researcher} at ${institution}, funded by ${funding}.`,
    methodologies[index % methodologies.length],
    `The ${category.toLowerCase()} included ${sampleSize} participants and achieved statistical significance.`,
    significances[(index + 1) % significances.length],
    implications[(index + 2) % implications.length],
    `Full methodology and supplementary materials are available via the DOI reference.`,
  ].join(" ");

  return {
    title: `${discipline} Research Study by ${institution}`,
    description,
    startDate: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    institution,
    researcher,
    funding,
    discipline,
    keywords: ["research", discipline?.toLowerCase() ?? "", "study", category.toLowerCase()].filter(Boolean),
    doi: `10.1234/example.${index + 1000}`,
    publication_date: pubDate,
    sample_size: sampleSize,
    category,
    tags,
    priority: generatePriority(index),
    rating: generateRating(index),
    views: generateCount(index, 31),
    registrations: generateCount(index, 7),
  };
};

/**
 * Generate cultural metadata.
 */
const generateCulturalMetadata = (index: number): Record<string, unknown> => {
  const venues = ["City Theater", "Music Hall", "Art Gallery", "Convention Center", "Stadium"];
  const genres = ["Rock", "Classical", "Jazz", "Pop", "Electronic"];
  const artistBackgrounds = [
    "The performer has been touring internationally for over a decade, bringing unique energy to every show.",
    "Known for their innovative style, this artist has won multiple awards and critical acclaim.",
    "A rising star in the industry, this performer has captivated audiences across the country.",
    "With roots in traditional forms and contemporary fusion, expect an unforgettable experience.",
    "This artist is known for interactive performances that engage the audience throughout.",
  ];
  const venueDescriptions = [
    "The venue features state-of-the-art acoustics and comfortable seating throughout.",
    "Located in the heart of the city, this iconic space has hosted legendary performances.",
    "Accessibility accommodations are available upon request when purchasing tickets.",
    "On-site parking and nearby public transit make the venue easily accessible.",
    "Concessions and merchandise will be available before the show and during intermission.",
  ];
  const eventDetails = [
    "Doors open one hour before showtime; early arrival is recommended.",
    "Photography is permitted during the performance; flash photography is discouraged.",
    "A meet-and-greet opportunity is available with VIP ticket purchases.",
    "The performance includes a brief intermission for refreshments.",
    "Special effects including lighting and sound may be intense for some audience members.",
  ];

  const venue = venues[index % venues.length] ?? "City Theater";
  const performer = `Artist ${index + 1}`;
  const genre = genres[index % genres.length] ?? "Rock";
  const eventDate = new Date(Date.now() + index * 86400000).toISOString();
  const ticketPrice = 25 + (index % 10) * 5;
  const capacity = 500 + (index % 10) * 100;
  const durationMinutes = 90 + (index % 6) * 30;
  const ageRestriction = index % 3 === 0 ? "21+" : "All Ages";
  const category = CATEGORIES.cultural[index % CATEGORIES.cultural.length] ?? "Concert";

  const tags = pickRandom(TAGS.cultural, 2 + Math.floor(Math.random() * 3));

  const description = [
    `Join us for a ${genre.toLowerCase()} ${category.toLowerCase()} featuring ${performer} at ${venue}.`,
    artistBackgrounds[index % artistBackgrounds.length],
    `This ${durationMinutes}-minute performance is ${ageRestriction === "21+" ? "for ages 21 and over" : "suitable for all ages"}.`,
    venueDescriptions[(index + 1) % venueDescriptions.length],
    `Tickets start at $${ticketPrice} with limited seating for ${capacity} guests.`,
    eventDetails[(index + 2) % eventDetails.length],
  ].join(" ");

  return {
    title: `${performer} Live at ${venue}`,
    description,
    startDate: eventDate,
    endDate: new Date(new Date(eventDate).getTime() + durationMinutes * 60000).toISOString(),
    venue,
    performer,
    ticket_price: ticketPrice,
    capacity,
    genre,
    duration_minutes: durationMinutes,
    age_restriction: ageRestriction,
    event_date: eventDate,
    category,
    tags,
    priority: generatePriority(index),
    rating: generateRating(index),
    attendees: generateCount(index, 13),
    registrations: generateCount(index, 19),
  };
};

/**
 * Generate economic metadata.
 */
const generateEconomicMetadata = (index: number): Record<string, unknown> => {
  const indicators = ["GDP", "Unemployment", "Inflation", "Trade Balance", "Consumer Confidence"];
  const regions = ["North America", "Europe", "Asia", "South America", "Africa"];
  const sectors = ["Technology", "Healthcare", "Finance", "Manufacturing", "Retail"];
  const trendAnalyses = [
    "The data shows a continuation of trends observed in the previous reporting period.",
    "Analysts note a significant shift compared to historical averages for this metric.",
    "Market conditions suggest potential volatility in the near-term outlook.",
    "Year-over-year comparisons indicate steady progress toward target benchmarks.",
    "Seasonal adjustments have been applied to normalize for cyclical variations.",
  ];
  const comparisons = [
    "Regional performance exceeds global averages by approximately 2 percentage points.",
    "The indicator trails peer economies but shows signs of convergence.",
    "Cross-sector analysis reveals divergent trends among key industry groups.",
    "Comparison with emerging markets highlights structural differences in growth patterns.",
    "Historical context suggests this level is consistent with mid-cycle economic conditions.",
  ];
  const forecasts = [
    "Projections for the next quarter remain cautiously optimistic based on leading indicators.",
    "Economic models suggest continued stability with modest upside potential.",
    "Risk factors including policy uncertainty may impact future measurements.",
    "Consensus forecasts point to gradual improvement over the coming months.",
    "Scenario analysis indicates resilience across most plausible economic pathways.",
  ];

  const indicator = indicators[index % indicators.length];
  const region = regions[index % regions.length];
  const sector = sectors[index % sectors.length];
  const period = `Q${(index % 4) + 1} 2024`;

  const value = Math.round(Math.random() * 1000) / 10;
  const confidence = ["high", "medium", "low"][index % 3] ?? "medium";
  const category = CATEGORIES.economic[index % CATEGORIES.economic.length] ?? "Report";

  const tags = pickRandom(TAGS.economic, 2 + Math.floor(Math.random() * 3));

  const description = [
    `Comprehensive ${category.toLowerCase()} on ${indicator} for the ${region} region during ${period}.`,
    `The current reading of ${value}% reflects conditions in the ${sector} sector and related industries.`,
    trendAnalyses[index % trendAnalyses.length],
    comparisons[(index + 1) % comparisons.length],
    `Data confidence level: ${confidence}.`,
    forecasts[(index + 2) % forecasts.length],
  ].join(" ");

  return {
    title: `${indicator} Report - ${region} (${period})`,
    description,
    startDate: new Date().toISOString(),
    indicator,
    value,
    unit: "%",
    region,
    sector,
    period,
    source: "Economic Research Bureau",
    confidence,
    category,
    tags,
    priority: generatePriority(index),
    rating: generateRating(index),
    views: generateCount(index, 29),
  };
};

/**
 * Generate metadata based on schema type.
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
 * Get the appropriate schema type for a catalog.
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
 * Get geographic region for a dataset.
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

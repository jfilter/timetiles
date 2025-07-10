import type { Event } from "../../../payload-types";

// Use Payload type with specific modifications for seed data
export type EventSeed = Omit<Event, 'id' | 'createdAt' | 'updatedAt' | 'dataset' | 'import' | 'eventTimestamp'> & {
  dataset: string; // This will be resolved to dataset ID during seeding
  eventTimestamp: Date; // Use Date object for easier seed data handling
};

export function eventSeeds(environment: string): EventSeed[] {
  const baseEvents: EventSeed[] = [
    {
      dataset: "air-quality-measurements",
      data: {
        station_id: "AQ001",
        timestamp: "2024-01-15T08:00:00Z",
        pm25: 25.5,
        pm10: 35.2,
        o3: 45,
        no2: 15.8,
        location: {
          lat: 40.7128,
          lng: -74.006,
        },
      },
      location: {
        latitude: 40.7128,
        longitude: -74.006,
      },
      eventTimestamp: new Date("2024-01-15T08:00:00Z"),
      isValid: true,
    },
    {
      dataset: "air-quality-measurements",
      data: {
        station_id: "AQ002",
        timestamp: "2024-01-15T08:00:00Z",
        pm25: 18.3,
        pm10: 28.7,
        o3: 38,
        no2: 12.4,
        location: {
          lat: 40.7589,
          lng: -73.9851,
        },
      },
      location: {
        latitude: 40.7589,
        longitude: -73.9851,
      },
      eventTimestamp: new Date("2024-01-15T08:00:00Z"),
      isValid: true,
    },
    {
      dataset: "gdp-growth-rates",
      data: {
        country: "United States",
        region: "North America",
        year: 2023,
        quarter: 4,
        gdp_growth_rate: 2.1,
        gdp_nominal: 27000000,
        currency: "USD",
      },
      eventTimestamp: new Date("2024-01-01T00:00:00Z"),
      isValid: true,
    },
    {
      dataset: "gdp-growth-rates",
      data: {
        country: "Germany",
        region: "Europe",
        year: 2023,
        quarter: 4,
        gdp_growth_rate: 1.8,
        gdp_nominal: 4200000,
        currency: "EUR",
      },
      eventTimestamp: new Date("2024-01-01T00:00:00Z"),
      isValid: true,
    },
  ];

  if (environment === "test") {
    // Only return test-specific events, do NOT include baseEvents
    return [
      {
        dataset: "test-dataset",
        data: {
          id: "test-001",
          value: 42,
        },
        eventTimestamp: new Date("2024-01-01T12:00:00Z"),
        isValid: true,
      },
      {
        dataset: "test-dataset",
        data: {
          id: "test-002",
          value: "invalid",
        },
        eventTimestamp: new Date("2024-01-01T12:05:00Z"),
        isValid: false,
        validationErrors: {
          field: "value",
          message: "Expected number, got string",
        },
      },
    ];
  }

  if (environment === "development") {
    return [
      ...baseEvents,
      {
        dataset: "social-media-engagement",
        data: {
          platform: "twitter",
          date: "2024-01-15",
          likes: 1250,
          shares: 89,
          comments: 156,
          impressions: 15000,
        },
        eventTimestamp: new Date("2024-01-15T23:59:59Z"),
        isValid: true,
      },
      {
        dataset: "social-media-engagement",
        data: {
          platform: "facebook",
          date: "2024-01-15",
          likes: 890,
          shares: 234,
          comments: 78,
          impressions: 12500,
        },
        eventTimestamp: new Date("2024-01-15T23:59:59Z"),
        isValid: true,
      },
      {
        dataset: "historical-weather-data",
        data: {
          date: "2020-12-31",
          temperature: -2.5,
          humidity: 85,
          precipitation: 5.2,
        },
        eventTimestamp: new Date("2020-12-31T23:59:59Z"),
        isValid: true,
      },
    ];
  }

  return baseEvents;
}

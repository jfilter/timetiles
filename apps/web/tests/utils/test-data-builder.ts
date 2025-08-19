/**
 * TestDataBuilder
 *
 * Enhanced test utilities with builder patterns for creating realistic test data.
 * Provides fluent APIs for constructing events, catalogs, datasets, and other entities
 * with realistic relationships and constraints.
 *
 * @module
 * @category Test Utilities
 */

import type { Catalog, Dataset, Event, ImportFile, User } from "@/payload-types";

/**
 * Base builder class with common functionality
 */
abstract class BaseTestBuilder<T> {
  protected data: Partial<T> = {};

  /**
   * Build the object with current data
   */
  build(): Partial<T> {
    return { ...this.data };
  }

  /**
   * Build multiple objects with incremental changes
   */
  buildMany(count: number, modifier?: (item: Partial<T>, index: number) => Partial<T>): Partial<T>[] {
    return Array.from({ length: count }, (_, i) => {
      const baseItem = { ...this.data };
      return modifier ? { ...baseItem, ...modifier(baseItem, i) } : baseItem;
    });
  }

  /**
   * Reset the builder to initial state
   */
  reset(): this {
    this.data = {};
    return this;
  }
}

/**
 * Event Builder - Fluent API for creating test events
 */
export class EventBuilder extends BaseTestBuilder<Event> {
  constructor() {
    super();
    // Set reasonable defaults
    this.data = {
      id: Math.floor(Math.random() * 10000),
      dataset: 1,
      data: {
        title: "Test Event",
      },
      location: { latitude: 40.7128, longitude: -74.006 }, // NYC default
      coordinateSource: { type: "manual" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private ensureDataIsObject(): Record<string, unknown> {
    if (typeof this.data.data === "object" && this.data.data !== null && !Array.isArray(this.data.data)) {
      return this.data.data as Record<string, unknown>;
    }
    return {};
  }

  private setDataProperty(key: string, value: unknown): this {
    const currentData = this.ensureDataIsObject();
    this.data.data = { ...currentData, [key]: value };
    return this;
  }

  withTitle(title: string): this {
    return this.setDataProperty("title", title);
  }

  withCoordinates(lat: number, lng: number): this {
    this.data.location = { latitude: lat, longitude: lng };
    return this;
  }

  withDataset(dataset: number): this {
    this.data.dataset = dataset;
    return this;
  }

  inTimeRange(start: Date, end: Date): this {
    const randomTime = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return this.setDataProperty("date", randomTime.toISOString());
  }

  withAddress(address: string): this {
    return this.setDataProperty("address", address);
  }

  withDescription(description: string): this {
    return this.setDataProperty("description", description);
  }

  withCategory(category: string): this {
    return this.setDataProperty("category", category);
  }

  withTags(tags: string[]): this {
    return this.setDataProperty("tags", tags);
  }

  withUrl(url: string): this {
    return this.setDataProperty("url", url);
  }

  nearLocation(centerLat: number, centerLng: number, radiusKm: number): this {
    const { lat, lng } = this.generateNearbyCoordinate({ latitude: centerLat, longitude: centerLng }, radiusKm);
    return this.withCoordinates(lat, lng);
  }

  withRealisticData(preset: "conference" | "meetup" | "workshop" | "festival" | "seminar"): this {
    const presets = {
      conference: {
        category: "Conference",
        tags: ["business", "networking", "professional"],
        url: "https://example-conference.com",
      },
      meetup: {
        category: "Meetup",
        tags: ["community", "social", "local"],
        description: "Local community gathering",
      },
      workshop: {
        category: "Workshop",
        tags: ["education", "hands-on", "learning"],
        description: "Hands-on learning experience",
      },
      festival: {
        category: "Festival",
        tags: ["entertainment", "culture", "music"],
        description: "Cultural celebration event",
      },
      seminar: {
        category: "Seminar",
        tags: ["education", "presentation", "professional"],
        description: "Educational presentation",
      },
    };

    const presetData = presets[preset];
    const currentData = this.ensureDataIsObject();
    this.data.data = { ...currentData, ...presetData };
    return this;
  }

  private generateNearbyCoordinate(
    center: { latitude: number; longitude: number },
    radiusKm: number
  ): { lat: number; lng: number } {
    // Convert radius to degrees (rough approximation)
    const radiusDeg = radiusKm / 111; // 1 degree ≈ 111 km

    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radiusDeg;

    const lat = center.latitude + distance * Math.cos(angle);
    const lng = center.longitude + distance * Math.sin(angle);

    return { lat, lng };
  }
}

/**
 * Catalog Builder - Fluent API for creating test catalogs
 */
export class CatalogBuilder extends BaseTestBuilder<Catalog> {
  constructor() {
    super();
    this.data = {
      name: "Test Catalog",
      slug: "test-catalog",
      description: this.createRichText("Test catalog description"),
      _status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  withName(name: string): this {
    this.data.name = name;
    this.data.slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return this;
  }

  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }

  withDescription(description: string): this {
    this.data.description = this.createRichText(description);
    return this;
  }

  withStatus(status: "draft" | "published"): this {
    this.data._status = status;
    return this;
  }

  private createRichText(text: string) {
    return {
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
    };
  }
}

/**
 * Dataset Builder - Fluent API for creating test datasets
 */
export class DatasetBuilder extends BaseTestBuilder<Dataset> {
  constructor() {
    super();
    this.data = {
      name: "Test Dataset",
      slug: "test-dataset",
      description: this.createRichText("Test dataset description"),
      catalog: 1,
      language: "eng",
      _status: "published",
      isPublic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  withName(name: string): this {
    this.data.name = name;
    this.data.slug = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    return this;
  }

  withSlug(slug: string): this {
    this.data.slug = slug;
    return this;
  }

  withCatalog(catalog: number): this {
    this.data.catalog = catalog;
    return this;
  }

  withDescription(description: string): this {
    this.data.description = this.createRichText(description);
    return this;
  }

  withLanguage(language: string): this {
    this.data.language = language;
    return this;
  }

  withStatus(status: "draft" | "published"): this {
    this.data._status = status;
    return this;
  }

  isPublic(isPublic: boolean): this {
    this.data.isPublic = isPublic;
    return this;
  }

  withSchemaConfig(enabled: boolean = true): this {
    this.data.schemaConfig = {
      enabled,
      locked: false,
      autoGrow: true,
      autoApproveNonBreaking: false,
    };
    return this;
  }

  withRealisticSchema(type: "events" | "sensors" | "economic" | "social"): this {
    const schemas = {
      events: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", format: "date-time" },
          location: { type: "string" },
          category: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["title", "date"],
      },
      sensors: {
        type: "object",
        properties: {
          timestamp: { type: "string", format: "date-time" },
          value: { type: "number" },
          unit: { type: "string" },
          sensor_id: { type: "string" },
          location: {
            type: "object",
            properties: {
              latitude: { type: "number" },
              longitude: { type: "number" },
            },
          },
        },
        required: ["timestamp", "value", "sensor_id"],
      },
      economic: {
        type: "object",
        properties: {
          indicator: { type: "string" },
          value: { type: "number" },
          period: { type: "string" },
          region: { type: "string" },
          currency: { type: "string" },
        },
        required: ["indicator", "value", "period"],
      },
      social: {
        type: "object",
        properties: {
          demographic: { type: "string" },
          count: { type: "number" },
          percentage: { type: "number" },
          location: { type: "string" },
          survey_date: { type: "string", format: "date" },
        },
        required: ["demographic", "count"],
      },
    };

    // Store the schema type in metadata for test reference
    this.data.metadata = { schemaType: type, expectedSchema: schemas[type] };
    // Enable schema config
    return this.withSchemaConfig(true);
  }

  private createRichText(text: string) {
    return {
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
    };
  }
}

/**
 * User Builder - Fluent API for creating test users
 */
export class UserBuilder extends BaseTestBuilder<User> {
  constructor() {
    super();
    this.data = {
      email: "test@example.com",
      password: "test123",
      firstName: "Test",
      lastName: "User",
      role: "user",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }

  withPassword(password: string): this {
    this.data.password = password;
    return this;
  }

  withName(firstName: string, lastName: string): this {
    this.data.firstName = firstName;
    this.data.lastName = lastName;
    return this;
  }

  withRole(role: "admin" | "editor" | "user"): this {
    this.data.role = role;
    return this;
  }

  isActive(active: boolean): this {
    this.data.isActive = active;
    return this;
  }

  asAdmin(): this {
    return this.withRole("admin").withEmail("admin@example.com").withName("Admin", "User");
  }

  asEditor(): this {
    return this.withRole("editor").withEmail("editor@example.com").withName("Data", "Editor");
  }
}

/**
 * ImportFile Builder - Fluent API for creating test import files
 */
export class ImportFileBuilder extends BaseTestBuilder<ImportFile> {
  constructor() {
    super();
    this.data = {
      filename: "test-import.csv",
      originalName: "test-import.csv",
      filesize: 1024,
      mimeType: "text/csv",
      status: "completed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  withFileName(filename: string): this {
    this.data.filename = filename;
    this.data.originalName = filename;
    return this;
  }

  withFileSize(size: number): this {
    this.data.filesize = size; // Use Payload's field name
    return this;
  }

  withMimeType(mimeType: string): this {
    this.data.mimeType = mimeType;
    return this;
  }

  withStatus(status: "pending" | "processing" | "completed" | "failed"): this {
    this.data.status = status;
    return this;
  }

  withDatasetsCount(count: number): this {
    this.data.datasetsCount = count;
    return this;
  }

  withCatalog(catalog: number): this {
    this.data.catalog = catalog;
    return this;
  }

  withDatasetsProcessed(processed: number): this {
    this.data.datasetsProcessed = processed;
    return this;
  }
}

// ImportDataset collection was removed

/**
 * Main TestDataBuilder class that provides access to all builders
 */
export class TestDataBuilder {
  static events(): EventBuilder {
    return new EventBuilder();
  }

  static catalogs(): CatalogBuilder {
    return new CatalogBuilder();
  }

  static datasets(): DatasetBuilder {
    return new DatasetBuilder();
  }

  static users(): UserBuilder {
    return new UserBuilder();
  }

  static ImportFiles(): ImportFileBuilder {
    return new ImportFileBuilder();
  }

  // importDatasets method removed - collection no longer exists

  /**
   * Create a realistic test scenario with related data
   */
  static createScenario(name: "conference-events" | "sensor-data" | "economic-indicators"): {
    catalogs: Partial<Catalog>[];
    datasets: Partial<Dataset>[];
    events: Partial<Event>[];
  } {
    const scenarios = {
      "conference-events": () => {
        const catalog = this.catalogs()
          .withName("Technology Events")
          .withDescription("Technology conferences and meetups")
          .build();

        const dataset = this.datasets()
          .withName("Tech Conference Schedule")
          .withCatalog(1)
          .withRealisticSchema("events")
          .build();

        const events = this.events()
          .withDataset(1)
          .withRealisticData("conference")
          .nearLocation(40.7128, -74.006, 50) // Within 50km of NYC
          .buildMany(10, (event, i) => ({
            ...event,
            data: {
              ...(typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
                ? event.data
                : {}),
              title: `Tech Conference ${i + 1}`,
              address: `${100 + i} Tech Street, New York, NY`,
            },
          }));

        return {
          catalogs: [catalog],
          datasets: [dataset],
          events,
        };
      },

      "sensor-data": () => {
        const catalog = this.catalogs()
          .withName("Environmental Sensors")
          .withDescription("Air quality and weather sensor data")
          .build();

        const dataset = this.datasets()
          .withName("Air Quality Measurements")
          .withCatalog(1)
          .withRealisticSchema("sensors")
          .build();

        const events = this.events()
          .withDataset(1)
          .withCategory("Sensor Reading")
          .buildMany(50, (event, i) => ({
            ...event,
            data: {
              ...(typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
                ? event.data
                : {}),
              title: `Air Quality Reading ${i + 1}`,
              value: Math.random() * 100,
              unit: "AQI",
              sensor_id: `sensor_${Math.floor(i / 10) + 1}`,
            },
          }));

        return {
          catalogs: [catalog],
          datasets: [dataset],
          events,
        };
      },

      "economic-indicators": () => {
        const catalog = this.catalogs()
          .withName("Economic Data")
          .withDescription("Economic indicators and statistics")
          .build();

        const dataset = this.datasets()
          .withName("GDP Growth Rates")
          .withCatalog(1)
          .withRealisticSchema("economic")
          .build();

        const events = this.events()
          .withDataset(1)
          .withCategory("Economic Indicator")
          .buildMany(20, (event, i) => ({
            ...event,
            data: {
              ...(typeof event.data === "object" && event.data !== null && !Array.isArray(event.data)
                ? event.data
                : {}),
              title: `GDP Report Q${(i % 4) + 1} 2024`,
              indicator: "GDP Growth Rate",
              value: Math.random() * 4 + 1, // 1-5% growth
              period: `Q${(i % 4) + 1} 2024`,
              region: ["US", "EU", "Asia", "Americas"][i % 4],
              currency: "USD",
            },
          }));

        return {
          catalogs: [catalog],
          datasets: [dataset],
          events,
        };
      },
    };

    return scenarios[name]();
  }
}

// Individual builders are already exported above through their class declarations

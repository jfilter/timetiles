/**
 * Test data factories and utilities for creating test objects.
 *
 * Provides factory functions for generating test data including:
 * - Utility data (dates, coordinates, files, CSV)
 * - Rich text structures for Payload CMS
 * - Domain objects (catalogs, datasets, events)
 *
 * @module
 * @category Test Setup
 */
import type { Catalog, Dataset, Event } from "@/payload-types";

// =============================================================================
// Utility Factories
// =============================================================================

export const createDateRange = (startDate: string, days: number) => {
  const start = new Date(startDate);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return date.toISOString();
  });
};

export const createCoordinateGrid = (centerLat: number, centerLng: number, count: number, spread: number = 0.01) => {
  return Array.from({ length: count }, () => ({
    latitude: centerLat + (Math.random() - 0.5) * spread,
    longitude: centerLng + (Math.random() - 0.5) * spread,
  }));
};

export const createTestFile = (name: string, content: string, type: string = "text/csv") => {
  return new File([content], name, { type });
};

export const createCSVContent = (headers: string[], rows: string[][]) => {
  const csvRows = [headers.join(","), ...rows.map((row) => row.join(","))];
  return csvRows.join("\n");
};

// =============================================================================
// Rich Text Helpers for Payload CMS
// =============================================================================

export const createRichText = (text: string) => ({
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

export const createRichTextWithFormatting = (text: string, formatting: "bold" | "italic" = "bold") => ({
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
            format: formatting === "bold" ? 1 : 2, // 1 = bold, 2 = italic
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

// =============================================================================
// Domain Object Factories - Catalogs
// =============================================================================

export const createCatalog = (overrides: Partial<Catalog> = {}): Catalog => ({
  id: 1,
  name: "Test Catalog",
  description: createRichText("A test catalog description"),
  slug: "test-catalog",
  _status: "published" as const,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createCatalogs = (count: number = 3): Catalog[] => {
  return Array.from({ length: count }, (_, i) =>
    createCatalog({
      id: i + 1,
      name: `Test Catalog ${i + 1}`,
      slug: `test-catalog-${i + 1}`,
      description: createRichText(`Description for catalog ${i + 1}`),
    })
  );
};

// =============================================================================
// Domain Object Factories - Datasets
// =============================================================================

export const createDataset = (overrides: Partial<Dataset> = {}): Dataset => ({
  id: 1,
  name: "Test Dataset",
  description: createRichText("A test dataset description"),
  catalog: 1,
  slug: "test-dataset",
  language: "eng",
  _status: "published" as const,
  isPublic: true,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createDatasets = (count: number = 3): Dataset[] => {
  // Define dataset names that match test expectations
  const datasetNames = ["Air Quality Measurements", "Water Quality Data", "GDP Growth Rates"];

  return Array.from({ length: count }, (_, i) => {
    const catalogId = (i % 2) + 1;
    // For dataset 3, use catalog 1 to match the test expectations
    const actualCatalogId = i === 2 ? 1 : catalogId;

    return createDataset({
      id: i + 1,
      name: datasetNames[i] ?? `Test Dataset ${i + 1}`,
      slug: `test-dataset-${i + 1}`,
      description: createRichText(`Description for dataset ${i + 1}`),
      catalog: { id: actualCatalogId } as any, // Mock as object with id property
    });
  });
};

// =============================================================================
// Domain Object Factories - Events
// =============================================================================

export const createEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  dataset: 1,
  uniqueId: "test-event-1",
  data: {
    title: "Test Event",
    description: "A test event description",
    date: "2024-03-15T10:00:00Z",
    category: "conference",
    tags: ["tech", "test"],
  },
  location: {
    latitude: 40.7128,
    longitude: -74.006,
  },
  coordinateSource: {
    type: "import",
  },
  updatedAt: "2024-01-01T00:00:00Z",
  createdAt: "2024-01-01T00:00:00Z",
  ...overrides,
});

export const createEvents = (count: number = 3): Event[] => {
  return Array.from({ length: count }, (_, i) =>
    createEvent({
      id: i + 1,
      dataset: 1,
      uniqueId: `test-event-${i + 1}`,
      data: {
        title: `Test Event ${i + 1}`,
        description: `Description for event ${i + 1}`,
        date: `2024-03-${15 + i}T10:00:00Z`,
      },
      location: {
        latitude: 40.7128 + i * 0.01,
        longitude: -74.006 + i * 0.01,
      },
    })
  );
};

// Simple event data for Map component (flattened structure)
export const createMapEvent = (overrides: any = {}) => ({
  id: "map-event-1",
  title: "Map Event",
  latitude: 40.7128,
  longitude: -74.006,
  ...overrides,
});

export const createMapEvents = (count: number = 3) => {
  return Array.from({ length: count }, (_, i) =>
    createMapEvent({
      id: `map-event-${i + 1}`,
      title: `Map Event ${i + 1}`,
      latitude: 40.7128 + i * 0.01,
      longitude: -74.006 + i * 0.01,
    })
  );
};

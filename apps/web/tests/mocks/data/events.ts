import type { Event } from "@/payload-types";

export const createMockEvent = (overrides: Partial<Event> = {}): Event => ({
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

export const createMockEvents = (count: number = 3): Event[] => {
  return Array.from({ length: count }, (_, i) =>
    createMockEvent({
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
    }),
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
    }),
  );
};

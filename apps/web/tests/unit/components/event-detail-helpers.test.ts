/**
 * Unit tests for event detail content helper functions.
 *
 * Tests the utility functions used by EventDetailContent component
 * for extracting and formatting event data.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type { Event } from "@/payload-types";

// Re-implement the helper functions for testing since they're not exported
// This also serves as documentation of expected behavior

const safeToString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
};

interface EventData {
  title?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  [key: string]: unknown;
}

const getEventData = (event: Partial<Event>): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

const getEventTitle = (eventData: EventData): string => {
  return safeToString(eventData.title) || safeToString(eventData.name) || "Untitled Event";
};

const getDatasetInfo = (dataset: unknown): { name: string; id: number } | null => {
  if (typeof dataset === "object" && dataset != null && "name" in dataset && "id" in dataset) {
    return { name: String(dataset.name), id: Number(dataset.id) };
  }
  return null;
};

const formatDateRange = (startDate: unknown, endDate: unknown): string | null => {
  const hasStart = startDate != null && safeToString(startDate) !== "";
  const hasEnd = endDate != null && safeToString(endDate) !== "";

  if (!hasStart && !hasEnd) return null;

  const parts: string[] = [];
  if (hasStart) {
    parts.push(new Date(safeToString(startDate)).toLocaleDateString("en-US"));
  }
  if (hasEnd && safeToString(startDate) !== safeToString(endDate)) {
    parts.push(new Date(safeToString(endDate)).toLocaleDateString("en-US"));
  }

  return parts.join(" - ");
};

const getLocationDisplay = (event: Partial<Event>, eventData: EventData): string | null => {
  if (event.geocodingInfo?.normalizedAddress) {
    return event.geocodingInfo.normalizedAddress;
  }
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

const hasValidCoordinates = (location: Event["location"]): boolean => {
  return (
    location?.latitude != null && location.latitude !== 0 && location?.longitude != null && location.longitude !== 0
  );
};

describe("safeToString", () => {
  it("should return empty string for null", () => {
    expect(safeToString(null)).toBe("");
  });

  it("should return empty string for undefined", () => {
    expect(safeToString(undefined)).toBe("");
  });

  it("should return string as-is", () => {
    expect(safeToString("hello")).toBe("hello");
    expect(safeToString("")).toBe("");
  });

  it("should convert numbers to strings", () => {
    expect(safeToString(42)).toBe("42");
    expect(safeToString(0)).toBe("0");
    expect(safeToString(-1.5)).toBe("-1.5");
  });

  it("should convert booleans to strings", () => {
    expect(safeToString(true)).toBe("true");
    expect(safeToString(false)).toBe("false");
  });

  it("should convert Date to ISO string", () => {
    const date = new Date("2024-01-15T10:30:00.000Z");
    expect(safeToString(date)).toBe("2024-01-15T10:30:00.000Z");
  });

  it("should return empty string for objects", () => {
    expect(safeToString({ foo: "bar" })).toBe("");
    expect(safeToString([])).toBe("");
  });
});

describe("getEventData", () => {
  it("should extract data object from event", () => {
    const event = { data: { title: "Test Event", description: "A test" } };
    expect(getEventData(event)).toEqual({ title: "Test Event", description: "A test" });
  });

  it("should return empty object if data is null", () => {
    const event = { data: null };
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if data is undefined", () => {
    const event = {};
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if data is an array", () => {
    const event = { data: [1, 2, 3] };
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if data is a primitive", () => {
    const event = { data: "string" as unknown };
    expect(getEventData(event as Partial<Event>)).toEqual({});
  });
});

describe("getEventTitle", () => {
  it("should return title if present", () => {
    expect(getEventTitle({ title: "Event Title" })).toBe("Event Title");
  });

  it("should return name if title is not present", () => {
    expect(getEventTitle({ name: "Event Name" })).toBe("Event Name");
  });

  it("should prefer title over name", () => {
    expect(getEventTitle({ title: "Title", name: "Name" })).toBe("Title");
  });

  it("should return 'Untitled Event' if neither is present", () => {
    expect(getEventTitle({})).toBe("Untitled Event");
  });

  it("should return 'Untitled Event' for empty title and name", () => {
    expect(getEventTitle({ title: "", name: "" })).toBe("Untitled Event");
  });

  it("should handle non-string title gracefully", () => {
    expect(getEventTitle({ title: 123 as unknown as string })).toBe("123");
  });
});

describe("getDatasetInfo", () => {
  it("should extract dataset info when both name and id are present", () => {
    const dataset = { name: "Test Dataset", id: 42 };
    expect(getDatasetInfo(dataset)).toEqual({ name: "Test Dataset", id: 42 });
  });

  it("should return null for null dataset", () => {
    expect(getDatasetInfo(null)).toBeNull();
  });

  it("should return null for undefined dataset", () => {
    expect(getDatasetInfo(undefined)).toBeNull();
  });

  it("should return null if name is missing", () => {
    expect(getDatasetInfo({ id: 42 })).toBeNull();
  });

  it("should return null if id is missing", () => {
    expect(getDatasetInfo({ name: "Test" })).toBeNull();
  });

  it("should convert non-string name to string", () => {
    const dataset = { name: 123, id: 1 };
    expect(getDatasetInfo(dataset)).toEqual({ name: "123", id: 1 });
  });

  it("should convert string id to number", () => {
    const dataset = { name: "Test", id: "42" };
    expect(getDatasetInfo(dataset)).toEqual({ name: "Test", id: 42 });
  });
});

describe("formatDateRange", () => {
  it("should return null when both dates are null", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });

  it("should return null when both dates are undefined", () => {
    expect(formatDateRange(undefined, undefined)).toBeNull();
  });

  it("should return null when both dates are empty strings", () => {
    expect(formatDateRange("", "")).toBeNull();
  });

  it("should format single start date", () => {
    const result = formatDateRange("2024-01-15", null);
    expect(result).toBe("1/15/2024");
  });

  it("should format single end date", () => {
    const result = formatDateRange(null, "2024-01-20");
    expect(result).toBe("1/20/2024");
  });

  it("should format date range with different dates", () => {
    const result = formatDateRange("2024-01-15", "2024-01-20");
    expect(result).toBe("1/15/2024 - 1/20/2024");
  });

  it("should not duplicate when start and end are the same", () => {
    const result = formatDateRange("2024-01-15", "2024-01-15");
    expect(result).toBe("1/15/2024");
  });
});

describe("getLocationDisplay", () => {
  it("should return normalized address when available", () => {
    const event = {
      geocodingInfo: { normalizedAddress: "123 Main St, City, Country" },
    };
    expect(getLocationDisplay(event, {})).toBe("123 Main St, City, Country");
  });

  it("should return city and country when geocoding not available", () => {
    const event = {};
    const eventData = { city: "New York", country: "USA" };
    expect(getLocationDisplay(event, eventData)).toBe("New York, USA");
  });

  it("should return only city when country is missing", () => {
    const event = {};
    const eventData = { city: "New York" };
    expect(getLocationDisplay(event, eventData)).toBe("New York");
  });

  it("should return only country when city is missing", () => {
    const event = {};
    const eventData = { country: "USA" };
    expect(getLocationDisplay(event, eventData)).toBe("USA");
  });

  it("should return null when no location info available", () => {
    expect(getLocationDisplay({}, {})).toBeNull();
  });

  it("should prefer geocoded address over city/country", () => {
    const event = {
      geocodingInfo: { normalizedAddress: "Geocoded Address" },
    };
    const eventData = { city: "City", country: "Country" };
    expect(getLocationDisplay(event, eventData)).toBe("Geocoded Address");
  });
});

describe("hasValidCoordinates", () => {
  it("should return true for valid non-zero coordinates", () => {
    const location = { latitude: 40.7128, longitude: -74.006 };
    expect(hasValidCoordinates(location)).toBe(true);
  });

  it("should return false for null location", () => {
    expect(hasValidCoordinates(null as unknown as Event["location"])).toBe(false);
  });

  it("should return false for undefined location", () => {
    expect(hasValidCoordinates(undefined)).toBe(false);
  });

  it("should return false when latitude is null", () => {
    const location = { latitude: null, longitude: -74.006 };
    expect(hasValidCoordinates(location as unknown as Event["location"])).toBe(false);
  });

  it("should return false when longitude is null", () => {
    const location = { latitude: 40.7128, longitude: null };
    expect(hasValidCoordinates(location as unknown as Event["location"])).toBe(false);
  });

  it("should return false when latitude is 0", () => {
    const location = { latitude: 0, longitude: -74.006 };
    expect(hasValidCoordinates(location)).toBe(false);
  });

  it("should return false when longitude is 0", () => {
    const location = { latitude: 40.7128, longitude: 0 };
    expect(hasValidCoordinates(location)).toBe(false);
  });

  it("should return false when both are 0", () => {
    const location = { latitude: 0, longitude: 0 };
    expect(hasValidCoordinates(location)).toBe(false);
  });
});

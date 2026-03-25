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

import {
  buildConsumedFieldSet,
  extractEventFields,
  formatDateRange,
  getDatasetInfo,
  getEventData,
  getEventTitle,
  getLocationDisplay,
  hasValidCoordinates,
  safeToString,
} from "@/lib/utils/event-detail";
import type { Event } from "@/payload-types";

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
  it("should extract originalData object from event", () => {
    const event = { originalData: { title: "Test Event", description: "A test" } } as unknown as Event;
    expect(getEventData(event)).toEqual({ title: "Test Event", description: "A test" });
  });

  it("should return empty object if originalData is null", () => {
    const event = { originalData: null } as unknown as Event;
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if originalData is undefined", () => {
    const event = {} as unknown as Event;
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if originalData is an array", () => {
    const event = { originalData: [1, 2, 3] } as unknown as Event;
    expect(getEventData(event)).toEqual({});
  });

  it("should return empty object if originalData is a primitive", () => {
    const event = { originalData: "string" } as unknown as Event;
    expect(getEventData(event)).toEqual({});
  });

  it("should fall back to data field for DTO objects", () => {
    const dto = { data: { title: "DTO Event" } };
    expect(getEventData(dto)).toEqual({ title: "DTO Event" });
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

  it("should use titlePath from field mappings when provided", () => {
    expect(getEventTitle({ Veranstaltungstitel: "Konzert" }, { titlePath: "Veranstaltungstitel" })).toBe("Konzert");
  });

  it("should fall back to title/name when titlePath field is empty", () => {
    expect(getEventTitle({ Veranstaltungstitel: "", name: "Fallback" }, { titlePath: "Veranstaltungstitel" })).toBe(
      "Fallback"
    );
  });
});

describe("extractEventFields", () => {
  it("should extract title and description using field mappings", () => {
    const data = { Titel: "Berlin Konzert", Beschreibung: "Live-Musik" };
    const result = extractEventFields(data, { titlePath: "Titel", descriptionPath: "Beschreibung" });
    expect(result.title).toBe("Berlin Konzert");
    expect(result.description).toBe("Live-Musik");
  });

  it("should fall back to common field names without mappings", () => {
    const result = extractEventFields({ title: "My Event", description: "Details" });
    expect(result.title).toBe("My Event");
    expect(result.description).toBe("Details");
  });

  it("should use eventId in fallback title", () => {
    const result = extractEventFields({}, null, 42);
    expect(result.title).toBe("Event 42");
  });
});

describe("getDatasetInfo", () => {
  it("should extract dataset info when name and id are present", () => {
    const dataset = { name: "Test Dataset", id: 42 };
    expect(getDatasetInfo(dataset)).toEqual({ name: "Test Dataset", id: 42 });
  });

  it("should use name field (canonical Payload field)", () => {
    const dataset = { title: "Title", name: "Name", id: 1 };
    expect(getDatasetInfo(dataset)).toEqual({ name: "Name", id: 1 });
  });

  it("should return null when only title is present (no name)", () => {
    const dataset = { title: "Title", id: 1 };
    expect(getDatasetInfo(dataset)).toBeNull();
  });

  it("should return null for null dataset", () => {
    expect(getDatasetInfo(null)).toBeNull();
  });

  it("should return null for undefined dataset", () => {
    expect(getDatasetInfo(undefined)).toBeNull();
  });

  it("should return null if neither title nor name is present", () => {
    expect(getDatasetInfo({ id: 42 })).toBeNull();
  });

  it("should convert string id to number", () => {
    const dataset = { name: "Test", id: "42" };
    expect(getDatasetInfo(dataset)).toEqual({ name: "Test", id: 42 });
  });

  it("should extract catalog name when catalog is a populated relation", () => {
    const dataset = { name: "Events", id: 5, catalog: { id: 1, name: "Public" } };
    expect(getDatasetInfo(dataset)).toEqual({ id: 5, name: "Events", catalog: "Public" });
  });

  it("should omit catalog when catalog is a number (not populated)", () => {
    const dataset = { name: "Events", id: 5, catalog: 3 };
    expect(getDatasetInfo(dataset)).toEqual({ id: 5, name: "Events" });
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
  it("should return location name when available", () => {
    const event = { locationName: "Central Park" } as Event;
    expect(getLocationDisplay(event)).toBe("Central Park");
  });

  it("should return normalized address when location name is not available", () => {
    const event = { geocodingInfo: { normalizedAddress: "123 Main St, City, Country" } } as Event;
    expect(getLocationDisplay(event)).toBe("123 Main St, City, Country");
  });

  it("should return null when no location info available", () => {
    expect(getLocationDisplay({} as Event)).toBeNull();
  });

  it("should prefer location name over geocoded address", () => {
    const event = { locationName: "Central Park", geocodingInfo: { normalizedAddress: "Geocoded Address" } } as Event;
    expect(getLocationDisplay(event)).toBe("Central Park");
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

describe("buildConsumedFieldSet", () => {
  it("should include probe keys and id with no mappings", () => {
    const result = buildConsumedFieldSet();
    expect(result).toEqual(new Set(["id", "title", "name", "description"]));
  });

  it("should include probe keys and id when mappings are null", () => {
    const result = buildConsumedFieldSet(null);
    expect(result).toEqual(new Set(["id", "title", "name", "description"]));
  });

  it("should include all mapping paths", () => {
    const result = buildConsumedFieldSet({
      titlePath: "Titel",
      descriptionPath: "Beschreibung",
      timestampPath: "Datum",
      locationPath: "Adresse",
      locationNamePath: "Ort",
      latitudePath: "Breitengrad",
      longitudePath: "Laengengrad",
    });
    expect(result.has("Titel")).toBe(true);
    expect(result.has("Beschreibung")).toBe(true);
    expect(result.has("Datum")).toBe(true);
    expect(result.has("Adresse")).toBe(true);
    expect(result.has("Ort")).toBe(true);
    expect(result.has("Breitengrad")).toBe(true);
    expect(result.has("Laengengrad")).toBe(true);
    // Probe keys still present
    expect(result.has("title")).toBe(true);
    expect(result.has("name")).toBe(true);
    expect(result.has("description")).toBe(true);
    expect(result.has("id")).toBe(true);
  });

  it("should skip null and empty mapping paths", () => {
    const result = buildConsumedFieldSet({ titlePath: "event_name", descriptionPath: null, timestampPath: "" });
    expect(result.has("event_name")).toBe(true);
    expect(result.size).toBe(5); // id, title, name, description, event_name
  });
});

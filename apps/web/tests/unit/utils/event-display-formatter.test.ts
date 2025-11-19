/**
 * Unit tests for event display formatter.
 *
 * Tests intelligent field selection and formatting for event display
 * based on field metadata and custom display configurations.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { formatEventForDisplay } from "../../../lib/utils/event-display-formatter";

describe("Event Display Formatter", () => {
  describe("with no field metadata", () => {
    it("should return first 3 fields when no metadata available", () => {
      const eventData = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
      };

      const result = formatEventForDisplay(eventData, null, 123);

      expect(result.primaryLabel).toBe("Event 123");
      expect(result.fields).toHaveLength(3);
      expect(result.fields[0]).toEqual({ key: "field1", value: "value1" });
      expect(result.fields[1]).toEqual({ key: "field2", value: "value2" });
      expect(result.fields[2]).toEqual({ key: "field3", value: "value3" });
    });

    it("should respect maxFields parameter", () => {
      const eventData = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
      };

      const result = formatEventForDisplay(eventData, null, 123, null, 2);

      expect(result.fields).toHaveLength(2);
    });

    it("should handle empty event data", () => {
      const result = formatEventForDisplay({}, null, 456);

      expect(result.primaryLabel).toBe("Event 456");
      expect(result.fields).toHaveLength(0);
    });
  });

  describe("with field metadata (automatic selection)", () => {
    it("should select field with 'title' in name as primary label", () => {
      const eventData = {
        title: "My Event Title",
        description: "Event description",
        date: "2024-01-15",
      };

      const fieldMetadata = {
        title: {
          path: "title",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 95,
          typeDistribution: { string: 100 },
        },
        description: {
          path: "description",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 90,
          typeDistribution: { string: 100 },
        },
        date: {
          path: "date",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 50,
          typeDistribution: { string: 100 },
          formats: { date: 100 },
        },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      expect(result.primaryLabel).toBe("My Event Title");
    });

    it("should select field with 'name' as fallback for primary label", () => {
      const eventData = {
        event_name: "Conference 2024",
        venue: "Main Hall",
      };

      const fieldMetadata = {
        event_name: {
          path: "event_name",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 90,
          typeDistribution: { string: 100 },
        },
        venue: {
          path: "venue",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 40,
          typeDistribution: { string: 100 },
        },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      expect(result.primaryLabel).toBe("Conference 2024");
    });

    it("should select most appropriate fields for display based on scoring", () => {
      const eventData = {
        id: "123",
        title: "Event",
        description: "Long description",
        venue: "Stadium",
        price: 50,
        internal_id: "abc123",
      };

      const fieldMetadata = {
        id: {
          path: "id",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 100,
          typeDistribution: { string: 100 },
        },
        title: {
          path: "title",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 95,
          typeDistribution: { string: 100 },
        },
        description: {
          path: "description",
          occurrences: 90,
          occurrencePercent: 90,
          uniqueValues: 85,
          typeDistribution: { string: 90 },
        },
        venue: {
          path: "venue",
          occurrences: 80,
          occurrencePercent: 80,
          uniqueValues: 30,
          typeDistribution: { string: 80 },
        },
        price: {
          path: "price",
          occurrences: 75,
          occurrencePercent: 75,
          uniqueValues: 20,
          typeDistribution: { number: 75 },
        },
        internal_id: {
          path: "internal_id",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 100,
          typeDistribution: { string: 100 },
        },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      // Should prioritize fields with good occurrence and meaningful data
      expect(result.fields.length).toBeLessThanOrEqual(3);
      // Should select high-occurrence fields (all have >30% occurrence threshold)
      expect(result.fields.length).toBeGreaterThan(0);
      // All fields should have values
      result.fields.forEach((field) => {
        expect(field.value).toBeTruthy();
      });
    });

    it("should filter out fields with low occurrence percentage", () => {
      const eventData = {
        title: "Event",
        rare_field: "value",
      };

      const fieldMetadata = {
        title: {
          path: "title",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 95,
          typeDistribution: { string: 100 },
        },
        rare_field: {
          path: "rare_field",
          occurrences: 20,
          occurrencePercent: 20, // Below 30% threshold
          uniqueValues: 15,
          typeDistribution: { string: 20 },
        },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      // rare_field should not appear in display fields
      expect(result.fields.every((f) => f.key !== "rare_field")).toBe(true);
    });
  });

  describe("with display configuration", () => {
    it("should use configured primary label field", () => {
      const eventData = {
        title: "Should not use this",
        event_name: "Should use this",
        description: "Some description",
      };

      const fieldMetadata = {
        title: {
          path: "title",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 95,
          typeDistribution: { string: 100 },
        },
        event_name: {
          path: "event_name",
          occurrences: 100,
          occurrencePercent: 100,
          uniqueValues: 90,
          typeDistribution: { string: 100 },
        },
      };

      const displayConfig = {
        primaryLabelField: "event_name",
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      expect(result.primaryLabel).toBe("Should use this");
    });

    it("should use configured display fields in order", () => {
      const eventData = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
      };

      const fieldMetadata = {
        field1: { path: "field1", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field2: { path: "field2", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field3: { path: "field3", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field4: { path: "field4", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
      };

      const displayConfig = {
        displayFields: [
          { fieldPath: "field3", label: "Custom Label 3" },
          { fieldPath: "field1", label: "Custom Label 1" },
        ],
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      expect(result.fields).toHaveLength(2);
      expect(result.fields[0]).toEqual({ key: "Custom Label 3", value: "value3" });
      expect(result.fields[1]).toEqual({ key: "Custom Label 1", value: "value1" });
    });

    it("should use field path as label when custom label not provided", () => {
      const eventData = {
        myField: "myValue",
      };

      const fieldMetadata = {
        myField: { path: "myField", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
      };

      const displayConfig = {
        displayFields: [{ fieldPath: "myField", label: null }],
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      expect(result.fields[0]?.key).toBe("myField");
    });

    it("should respect maxDisplayFields from config", () => {
      const eventData = {
        field1: "value1",
        field2: "value2",
        field3: "value3",
        field4: "value4",
      };

      const fieldMetadata = {
        field1: { path: "field1", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field2: { path: "field2", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field3: { path: "field3", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field4: { path: "field4", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
      };

      const displayConfig = {
        maxDisplayFields: 2,
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      expect(result.fields.length).toBeLessThanOrEqual(2);
    });

    it("should handle nested field paths", () => {
      const eventData = {
        location: {
          city: "New York",
          country: "USA",
        },
        event: {
          name: "Conference",
        },
      };

      const fieldMetadata = {
        "location.city": {
          path: "location.city",
          occurrences: 100,
          occurrencePercent: 100,
          typeDistribution: { string: 100 },
        },
      };

      const displayConfig = {
        displayFields: [{ fieldPath: "location.city", label: "City" }],
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      expect(result.fields[0]).toEqual({ key: "City", value: "New York" });
    });

    it("should skip fields with missing values", () => {
      const eventData = {
        field1: "value1",
        field2: null,
        field3: "",
      };

      const fieldMetadata = {
        field1: { path: "field1", occurrences: 100, occurrencePercent: 100, typeDistribution: { string: 100 } },
        field2: { path: "field2", occurrences: 50, occurrencePercent: 50, typeDistribution: { string: 50 } },
      };

      const displayConfig = {
        displayFields: [
          { fieldPath: "field1", label: "Field 1" },
          { fieldPath: "field2", label: "Field 2" },
          { fieldPath: "field3", label: "Field 3" },
        ],
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123, displayConfig);

      // Only field1 should be included (field2 is null, field3 is empty)
      expect(result.fields).toHaveLength(1);
      expect(result.fields[0]?.key).toBe("Field 1");
    });
  });

  describe("value formatting", () => {
    it("should format numbers correctly", () => {
      const eventData = { price: 42.5 };
      const fieldMetadata = {
        price: { path: "price", occurrences: 100, occurrencePercent: 100, typeDistribution: { number: 100 } },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      expect(result.fields.some((f) => f.value === "42.5")).toBe(true);
    });

    it("should format booleans correctly", () => {
      const eventData = { active: true };
      const fieldMetadata = {
        active: { path: "active", occurrences: 100, occurrencePercent: 100, typeDistribution: { boolean: 100 } },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      expect(result.fields.some((f) => f.value === "true")).toBe(true);
    });

    it("should truncate long strings", () => {
      const longString = "a".repeat(150);
      const eventData = { description: longString };
      const fieldMetadata = {
        description: {
          path: "description",
          occurrences: 100,
          occurrencePercent: 100,
          typeDistribution: { string: 100 },
        },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      const descField = result.fields.find((f) => f.key === "description");
      expect(descField?.value.length).toBeLessThanOrEqual(100);
      expect(descField?.value).toContain("...");
    });

    it("should handle arrays by showing item count", () => {
      const eventData = { tags: ["tag1", "tag2", "tag3"] };
      const fieldMetadata = {
        tags: { path: "tags", occurrences: 100, occurrencePercent: 100, typeDistribution: { array: 100 } },
      };

      const result = formatEventForDisplay(eventData, fieldMetadata, 123);

      const tagsField = result.fields.find((f) => f.key === "tags");
      expect(tagsField?.value).toBe("[3 items]");
    });
  });
});

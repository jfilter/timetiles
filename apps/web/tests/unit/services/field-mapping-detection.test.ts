/**
 * Unit tests for field mapping detection service.
 *
 * Tests the language-aware pattern matching for detecting title, description,
 * and timestamp fields across multiple languages.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { detectFieldMappings } from "@/lib/services/schema-builder/field-mapping-detection";
import type { FieldStatistics } from "@/lib/types/schema-detection";

// Helper to create field stats
const createFieldStats = (
  fields: Record<string, Partial<FieldStatistics> & { fieldType?: "title" | "description" | "timestamp" }>
): Record<string, FieldStatistics> => {
  const stats: Record<string, FieldStatistics> = {};
  for (const [name, partial] of Object.entries(fields)) {
    const fieldType = partial.fieldType;
    let defaultSamples = ["sample1", "sample2"];
    let defaultFormats = {};

    // Set defaults based on field type
    if (fieldType === "title") {
      defaultSamples = ["Event Title", "Another Event", "Conference 2024"];
    } else if (fieldType === "description") {
      defaultSamples = [
        "This is a longer description of the event with more details about what will happen",
        "Another description with sufficient length to be recognized as a description field",
      ];
    } else if (fieldType === "timestamp") {
      defaultSamples = ["2024-01-15T10:30:00Z", "2024-02-20T14:00:00Z", "2024-03-10T09:15:00Z"];
      defaultFormats = { dateTime: 100 };
    }

    // eslint-disable-next-line sonarjs/no-unused-vars
    const { fieldType: _, ...partialWithoutFieldType } = partial;
    stats[name] = {
      path: name,
      occurrences: 100,
      occurrencePercent: 1.0,
      nullCount: 0,
      uniqueValues: 50,
      uniqueSamples: defaultSamples,
      typeDistribution: { string: 100 },
      formats: defaultFormats,
      isEnumCandidate: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
      depth: 0,
      ...partialWithoutFieldType,
    };
  }
  return stats;
};

describe("Field Mapping Detection", () => {
  describe("English (eng)", () => {
    it("should detect common English title fields", () => {
      const fieldStats = createFieldStats({
        title: { fieldType: "title" },
        description: { fieldType: "description" },
        date: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.titlePath).toBe("title");
      expect(mappings.descriptionPath).toBe("description");
      expect(mappings.timestampPath).toBe("date");
    });

    it("should prefer 'title' over 'name'", () => {
      const fieldStats = createFieldStats({
        name: { fieldType: "title" },
        title: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.titlePath).toBe("title");
    });

    it("should detect 'event_name' as title", () => {
      const fieldStats = createFieldStats({
        event_name: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.titlePath).toBe("event_name");
    });

    it("should detect timestamp variations", () => {
      const cases = [
        { field: "timestamp", expected: "timestamp" },
        { field: "datetime", expected: "datetime" },
        { field: "created_at", expected: "created_at" },
        { field: "event_date", expected: "event_date" },
        { field: "date_time", expected: "date_time" },
      ];

      for (const { field, expected } of cases) {
        const fieldStats = createFieldStats({ [field]: { fieldType: "timestamp" } });
        const mappings = detectFieldMappings(fieldStats, "eng");
        expect(mappings.timestampPath).toBe(expected);
      }
    });
  });

  describe("German (deu)", () => {
    it("should detect German title fields", () => {
      const fieldStats = createFieldStats({
        titel: { fieldType: "title" },
        beschreibung: { fieldType: "description" },
        datum: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "deu");

      expect(mappings.titlePath).toBe("titel");
      expect(mappings.descriptionPath).toBe("beschreibung");
      expect(mappings.timestampPath).toBe("datum");
    });

    it("should detect 'bezeichnung' as title", () => {
      const fieldStats = createFieldStats({
        bezeichnung: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "deu");

      expect(mappings.titlePath).toBe("bezeichnung");
    });

    it("should detect 'veranstaltung' (event) as title", () => {
      const fieldStats = createFieldStats({
        veranstaltung: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "deu");

      expect(mappings.titlePath).toBe("veranstaltung");
    });
  });

  describe("French (fra)", () => {
    it("should detect French title fields", () => {
      const fieldStats = createFieldStats({
        titre: { fieldType: "title" },
        description: { fieldType: "timestamp" },
        date: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "fra");

      expect(mappings.titlePath).toBe("titre");
      expect(mappings.descriptionPath).toBe("description");
      expect(mappings.timestampPath).toBe("date");
    });

    it("should detect 'événement' as title", () => {
      const fieldStats = createFieldStats({
        événement: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "fra");

      expect(mappings.titlePath).toBe("événement");
    });

    it("should detect 'heure' (time) as timestamp", () => {
      const fieldStats = createFieldStats({
        heure: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "fra");

      expect(mappings.timestampPath).toBe("heure");
    });
  });

  describe("Spanish (spa)", () => {
    it("should detect Spanish title fields", () => {
      const fieldStats = createFieldStats({
        título: { fieldType: "title" },
        descripción: { fieldType: "description" },
        fecha: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "spa");

      expect(mappings.titlePath).toBe("título");
      expect(mappings.descriptionPath).toBe("descripción");
      expect(mappings.timestampPath).toBe("fecha");
    });

    it("should detect 'evento' as title", () => {
      const fieldStats = createFieldStats({
        evento: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "spa");

      expect(mappings.titlePath).toBe("evento");
    });

    it("should detect 'hora' as timestamp", () => {
      const fieldStats = createFieldStats({
        hora: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "spa");

      expect(mappings.timestampPath).toBe("hora");
    });
  });

  describe("Italian (ita)", () => {
    it("should detect Italian title fields", () => {
      const fieldStats = createFieldStats({
        titolo: { fieldType: "title" },
        descrizione: { fieldType: "description" },
        data: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "ita");

      expect(mappings.titlePath).toBe("titolo");
      expect(mappings.descriptionPath).toBe("descrizione");
      expect(mappings.timestampPath).toBe("data");
    });

    it("should detect 'evento' as title", () => {
      const fieldStats = createFieldStats({
        evento: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "ita");

      expect(mappings.titlePath).toBe("evento");
    });
  });

  describe("Dutch (nld)", () => {
    it("should detect Dutch title fields", () => {
      const fieldStats = createFieldStats({
        titel: { fieldType: "title" },
        beschrijving: { fieldType: "description" },
        datum: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "nld");

      expect(mappings.titlePath).toBe("titel");
      expect(mappings.descriptionPath).toBe("beschrijving");
      expect(mappings.timestampPath).toBe("datum");
    });

    it("should detect 'evenement' as title", () => {
      const fieldStats = createFieldStats({
        evenement: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "nld");

      expect(mappings.titlePath).toBe("evenement");
    });
  });

  describe("Portuguese (por)", () => {
    it("should detect Portuguese title fields", () => {
      const fieldStats = createFieldStats({
        título: { fieldType: "title" },
        descrição: { fieldType: "description" },
        data: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "por");

      expect(mappings.titlePath).toBe("título");
      expect(mappings.descriptionPath).toBe("descrição");
      expect(mappings.timestampPath).toBe("data");
    });

    it("should detect 'evento' as title", () => {
      const fieldStats = createFieldStats({
        evento: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "por");

      expect(mappings.titlePath).toBe("evento");
    });
  });

  describe("Fallback to English", () => {
    it("should use English patterns for unknown language", () => {
      const fieldStats = createFieldStats({
        title: { fieldType: "timestamp" },
        description: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "unknown");

      expect(mappings.titlePath).toBe("title");
      expect(mappings.descriptionPath).toBe("description");
    });

    it("should detect English patterns when primary language has no matches", () => {
      const fieldStats = createFieldStats({
        title: {}, // English field in German dataset
      });

      const mappings = detectFieldMappings(fieldStats, "deu");

      expect(mappings.titlePath).toBe("title");
    });
  });

  describe("No matches", () => {
    it("should return null when no fields match", () => {
      const fieldStats = createFieldStats({
        random_field: { fieldType: "timestamp" },
        another_field: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.titlePath).toBeNull();
      expect(mappings.descriptionPath).toBeNull();
      expect(mappings.timestampPath).toBeNull();
    });
  });

  describe("Case insensitivity", () => {
    it("should match fields regardless of case", () => {
      const fieldStats = createFieldStats({
        TITLE: { fieldType: "timestamp" },
        Description: { fieldType: "timestamp" },
        DATE: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.titlePath).toBe("TITLE");
      expect(mappings.descriptionPath).toBe("Description");
      expect(mappings.timestampPath).toBe("DATE");
    });
  });

  describe("Field priority", () => {
    it("should prefer more specific fields over generic ones", () => {
      const fieldStats = createFieldStats({
        name: { fieldType: "title" },
        title: { fieldType: "title" },
        event_name: { fieldType: "title" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      // 'title' should win over 'name' and 'event_name'
      expect(mappings.titlePath).toBe("title");
    });

    it("should prefer 'description' over 'details'", () => {
      const fieldStats = createFieldStats({
        details: { fieldType: "timestamp" },
        description: { fieldType: "timestamp" },
      });

      const mappings = detectFieldMappings(fieldStats, "eng");

      expect(mappings.descriptionPath).toBe("description");
    });
  });
});

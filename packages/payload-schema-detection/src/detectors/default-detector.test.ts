/**
 * Default detector tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { DetectionContext, FieldStatistics } from "../types";
import { defaultDetector } from "./default-detector";

const createFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics => ({
  path: "test",
  occurrences: 100,
  occurrencePercent: 100,
  nullCount: 0,
  uniqueValues: 100,
  uniqueSamples: [],
  typeDistribution: { string: 100 },
  formats: {},
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: 0,
  ...overrides,
});

// eslint-disable-next-line sonarjs/max-lines-per-function -- Test suite with many test cases
describe("defaultDetector", () => {
  describe("metadata", () => {
    it("has correct name", () => {
      expect(defaultDetector.name).toBe("default");
    });

    it("has label and description", () => {
      expect(defaultDetector.label).toBeDefined();
      expect(defaultDetector.description).toBeDefined();
    });
  });

  describe("canHandle", () => {
    it("always returns true", () => {
      const context: DetectionContext = {
        fieldStats: {},
        sampleData: [],
        headers: [],
        config: { enabled: true, priority: 1 },
      };

      expect(defaultDetector.canHandle(context)).toBe(true);
    });
  });

  // eslint-disable-next-line sonarjs/max-lines-per-function -- Test suite with comprehensive detection scenarios
  describe("detect", () => {
    it("detects English from sample data", async () => {
      const context: DetectionContext = {
        fieldStats: {
          title: createFieldStats({ typeDistribution: { string: 100 } }),
          description: createFieldStats({ typeDistribution: { string: 100 } }),
        },
        sampleData: [
          { title: "Summer Music Festival", description: "A wonderful outdoor concert event" },
          { title: "Art Exhibition Opening", description: "Contemporary art showcase in the gallery" },
          { title: "Food and Wine Tasting", description: "Explore local wines and cuisine" },
        ],
        headers: ["title", "description"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.language.code).toBe("eng");
      expect(result.language.name).toBe("English");
    });

    it("detects German from sample data", async () => {
      const context: DetectionContext = {
        fieldStats: {
          titel: createFieldStats({ typeDistribution: { string: 100 } }),
          beschreibung: createFieldStats({ typeDistribution: { string: 100 } }),
        },
        sampleData: [
          { titel: "Sommermusikfestival", beschreibung: "Ein wunderbares Konzert im Freien" },
          { titel: "Kunstausstellung Eröffnung", beschreibung: "Zeitgenössische Kunst in der Galerie" },
          { titel: "Wein und Speisen Verkostung", beschreibung: "Entdecken Sie lokale Weine und Küche" },
        ],
        headers: ["titel", "beschreibung"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.language.code).toBe("deu");
      expect(result.language.name).toBe("German");
    });

    it("detects field mappings based on language", async () => {
      const context: DetectionContext = {
        fieldStats: {
          titel: createFieldStats({ typeDistribution: { string: 100 } }),
          beschreibung: createFieldStats({ typeDistribution: { string: 100 } }),
          datum: createFieldStats({
            typeDistribution: { string: 100 },
            formats: { date: 100 },
          }),
          ort: createFieldStats({ typeDistribution: { string: 100 } }),
        },
        sampleData: [
          {
            titel: "Konzert im Stadtpark",
            beschreibung: "Ein wunderbares Konzert mit klassischer Musik",
            datum: "2024-06-15",
            ort: "Stadtpark Berlin",
          },
          {
            titel: "Theaterpremiere",
            beschreibung: "Die neue Produktion des Stadttheaters",
            datum: "2024-06-20",
            ort: "Stadttheater München",
          },
        ],
        headers: ["titel", "beschreibung", "datum", "ort"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.fieldMappings.title?.path).toBe("titel");
      expect(result.fieldMappings.description?.path).toBe("beschreibung");
      expect(result.fieldMappings.timestamp?.path).toBe("datum");
      expect(result.fieldMappings.locationName?.path).toBe("ort");
    });

    it("detects geo fields", async () => {
      const context: DetectionContext = {
        fieldStats: {
          title: createFieldStats({ typeDistribution: { string: 100 } }),
          lat: createFieldStats({
            typeDistribution: { number: 100 },
            numericStats: { min: -90, max: 90, avg: 45, isInteger: false },
          }),
          lng: createFieldStats({
            typeDistribution: { number: 100 },
            numericStats: { min: -180, max: 180, avg: 10, isInteger: false },
          }),
        },
        sampleData: [
          { title: "Berlin Event", lat: 52.52, lng: 13.405 },
          { title: "Paris Event", lat: 48.8566, lng: 2.3522 },
        ],
        headers: ["title", "lat", "lng"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.fieldMappings.geo).not.toBeNull();
      expect(result.fieldMappings.geo?.type).toBe("separate");
      expect(result.fieldMappings.geo?.latitude?.path).toBe("lat");
      expect(result.fieldMappings.geo?.longitude?.path).toBe("lng");
    });

    it("detects ID fields", async () => {
      const context: DetectionContext = {
        fieldStats: {
          id: createFieldStats({
            typeDistribution: { number: 100 },
            uniqueValues: 100,
            occurrences: 100,
          }),
          title: createFieldStats({ typeDistribution: { string: 100 } }),
        },
        sampleData: [
          { id: 1, title: "Event 1" },
          { id: 2, title: "Event 2" },
        ],
        headers: ["id", "title"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.patterns.idFields).toContain("id");
    });

    it("detects enum fields", async () => {
      const context: DetectionContext = {
        fieldStats: {
          title: createFieldStats({ typeDistribution: { string: 100 } }),
          status: createFieldStats({
            typeDistribution: { string: 100 },
            uniqueValues: 3,
            occurrences: 100,
            uniqueSamples: ["active", "cancelled", "completed"],
          }),
        },
        sampleData: [
          { title: "Event 1", status: "active" },
          { title: "Event 2", status: "cancelled" },
        ],
        headers: ["title", "status"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result.patterns.enumFields).toContain("status");
    });

    it("returns complete result structure", async () => {
      const context: DetectionContext = {
        fieldStats: {
          title: createFieldStats({ typeDistribution: { string: 100 } }),
        },
        sampleData: [{ title: "Test Event" }],
        headers: ["title"],
        config: { enabled: true, priority: 1 },
      };

      const result = await defaultDetector.detect(context);

      expect(result).toHaveProperty("language");
      expect(result).toHaveProperty("fieldMappings");
      expect(result).toHaveProperty("patterns");
      expect(result.language).toHaveProperty("code");
      expect(result.language).toHaveProperty("name");
      expect(result.language).toHaveProperty("confidence");
      expect(result.language).toHaveProperty("isReliable");
      expect(result.fieldMappings).toHaveProperty("title");
      expect(result.fieldMappings).toHaveProperty("description");
      expect(result.fieldMappings).toHaveProperty("timestamp");
      expect(result.fieldMappings).toHaveProperty("locationName");
      expect(result.fieldMappings).toHaveProperty("geo");
      expect(result.patterns).toHaveProperty("idFields");
      expect(result.patterns).toHaveProperty("enumFields");
    });
  });
});

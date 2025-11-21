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
  fields: Record<
    string,
    Partial<FieldStatistics> & {
      fieldType?: "title" | "description" | "timestamp" | "latitude" | "longitude" | "location";
    }
  >
): Record<string, FieldStatistics> => {
  const stats: Record<string, FieldStatistics> = {};
  for (const [name, partial] of Object.entries(fields)) {
    const fieldType = partial.fieldType;
    let defaultSamples: (string | number | boolean | Record<string, unknown> | null)[] = ["sample1", "sample2"];
    let defaultFormats = {};
    let defaultTypeDistribution: Record<string, number> = { string: 100 };
    let defaultNumericStats = undefined;

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
    } else if (fieldType === "latitude") {
      defaultSamples = [40.7128, 51.5074, 48.8566, -33.8688, 35.6762];
      defaultTypeDistribution = { number: 100 };
      defaultNumericStats = { min: -33.8688, max: 51.5074, avg: 28.58044, isInteger: false };
    } else if (fieldType === "longitude") {
      defaultSamples = [-74.006, -0.1278, 2.3522, 151.2093, 139.6503];
      defaultTypeDistribution = { number: 100 };
      defaultNumericStats = { min: -74.006, max: 151.2093, avg: 43.82564, isInteger: false };
    } else if (fieldType === "location") {
      defaultSamples = ["123 Main St, New York, NY", "Berlin", "San Francisco", "Eiffel Tower, Paris", "10001"];
      defaultTypeDistribution = { string: 100 };
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
      typeDistribution: defaultTypeDistribution,
      formats: defaultFormats,
      isEnumCandidate: false,
      firstSeen: new Date(),
      lastSeen: new Date(),
      depth: 0,
      numericStats: defaultNumericStats,
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

  describe("Geographic Field Detection", () => {
    describe("Coordinate fields", () => {
      it("should detect lat/lon numeric fields", () => {
        const fieldStats = createFieldStats({
          lat: { fieldType: "latitude" },
          lon: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("lat");
        expect(mappings.longitudePath).toBe("lon");
      });

      it("should detect latitude/longitude full name fields", () => {
        const fieldStats = createFieldStats({
          latitude: { fieldType: "latitude" },
          longitude: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("latitude");
        expect(mappings.longitudePath).toBe("longitude");
      });

      it("should detect lng as longitude", () => {
        const fieldStats = createFieldStats({
          lat: { fieldType: "latitude" },
          lng: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("lat");
        expect(mappings.longitudePath).toBe("lng");
      });

      it("should detect y_coord/x_coord fields", () => {
        const fieldStats = createFieldStats({
          y_coord: { fieldType: "latitude" },
          x_coord: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("y_coord");
        expect(mappings.longitudePath).toBe("x_coord");
      });

      it("should detect geo_lat/geo_lon fields", () => {
        const fieldStats = createFieldStats({
          geo_lat: { fieldType: "latitude" },
          geo_lon: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("geo_lat");
        expect(mappings.longitudePath).toBe("geo_lon");
      });

      it("should detect string coordinates that can be parsed", () => {
        const fieldStats = createFieldStats({
          lat: {
            uniqueSamples: ["40.7128", "51.5074", "48.8566"],
            typeDistribution: { string: 100 },
          },
          lon: {
            uniqueSamples: ["-74.0060", "0.1278", "2.3522"],
            typeDistribution: { string: 100 },
          },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("lat");
        expect(mappings.longitudePath).toBe("lon");
      });

      it("should not detect coordinates outside valid bounds", () => {
        const fieldStats = createFieldStats({
          lat: {
            uniqueSamples: [200, 300, 400],
            typeDistribution: { number: 100 },
            numericStats: { min: 200, max: 400, avg: 300, isInteger: false },
          },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBeNull();
      });

      it("should reject latitude values outside -90 to 90", () => {
        const fieldStats = createFieldStats({
          latitude: {
            uniqueSamples: [-95, 100, 120],
            typeDistribution: { number: 100 },
            numericStats: { min: -95, max: 120, avg: 41.67, isInteger: false },
          },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBeNull();
      });

      it("should reject longitude values outside -180 to 180", () => {
        const fieldStats = createFieldStats({
          longitude: {
            uniqueSamples: [-200, 250, 300],
            typeDistribution: { number: 100 },
            numericStats: { min: -200, max: 300, avg: 116.67, isInteger: false },
          },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.longitudePath).toBeNull();
      });
    });

    describe("Location fields (English)", () => {
      it("should detect common location field names", () => {
        const testCases = ["address", "location", "place", "venue", "city", "town", "street"];

        for (const fieldName of testCases) {
          const fieldStats = createFieldStats({
            [fieldName]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "eng");

          expect(mappings.locationPath).toBe(fieldName);
        }
      });

      it("should detect addr as address", () => {
        const fieldStats = createFieldStats({
          addr: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.locationPath).toBe("addr");
      });

      it("should detect event_location field", () => {
        const fieldStats = createFieldStats({
          event_location: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.locationPath).toBe("event_location");
      });

      it("should detect full_address field", () => {
        const fieldStats = createFieldStats({
          full_address: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.locationPath).toBe("full_address");
      });
    });

    describe("Location fields (German)", () => {
      it("should detect German location fields", () => {
        const testCases = [
          { field: "adresse", expected: "adresse" },
          { field: "ort", expected: "ort" },
          { field: "standort", expected: "standort" },
          { field: "stadt", expected: "stadt" },
          { field: "veranstaltungsort", expected: "veranstaltungsort" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "deu");

          expect(mappings.locationPath).toBe(expected);
        }
      });

      it("should detect straße (street with umlaut)", () => {
        const fieldStats = createFieldStats({
          straße: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "deu");

        expect(mappings.locationPath).toBe("straße");
      });

      it("should detect strasse (street without umlaut)", () => {
        const fieldStats = createFieldStats({
          strasse: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "deu");

        expect(mappings.locationPath).toBe("strasse");
      });
    });

    describe("Location fields (French)", () => {
      it("should detect French location fields", () => {
        const testCases = [
          { field: "adresse", expected: "adresse" },
          { field: "lieu", expected: "lieu" },
          { field: "ville", expected: "ville" },
          { field: "salle", expected: "salle" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "fra");

          expect(mappings.locationPath).toBe(expected);
        }
      });
    });

    describe("Location fields (Spanish)", () => {
      it("should detect Spanish location fields", () => {
        const testCases = [
          { field: "dirección", expected: "dirección" },
          { field: "lugar", expected: "lugar" },
          { field: "ubicación", expected: "ubicación" },
          { field: "ciudad", expected: "ciudad" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "spa");

          expect(mappings.locationPath).toBe(expected);
        }
      });
    });

    describe("Location fields (Italian)", () => {
      it("should detect Italian location fields", () => {
        const testCases = [
          { field: "indirizzo", expected: "indirizzo" },
          { field: "luogo", expected: "luogo" },
          { field: "posizione", expected: "posizione" },
          { field: "città", expected: "città" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "ita");

          expect(mappings.locationPath).toBe(expected);
        }
      });
    });

    describe("Location fields (Dutch)", () => {
      it("should detect Dutch location fields", () => {
        const testCases = [
          { field: "adres", expected: "adres" },
          { field: "locatie", expected: "locatie" },
          { field: "plaats", expected: "plaats" },
          { field: "stad", expected: "stad" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "nld");

          expect(mappings.locationPath).toBe(expected);
        }
      });
    });

    describe("Location fields (Portuguese)", () => {
      it("should detect Portuguese location fields", () => {
        const testCases = [
          { field: "endereço", expected: "endereço" },
          { field: "local", expected: "local" },
          { field: "localização", expected: "localização" },
          { field: "cidade", expected: "cidade" },
        ];

        for (const { field, expected } of testCases) {
          const fieldStats = createFieldStats({
            [field]: { fieldType: "location" },
          });

          const mappings = detectFieldMappings(fieldStats, "por");

          expect(mappings.locationPath).toBe(expected);
        }
      });
    });

    describe("Mixed geo fields", () => {
      it("should detect coordinates and location together", () => {
        const fieldStats = createFieldStats({
          latitude: { fieldType: "latitude" },
          longitude: { fieldType: "longitude" },
          address: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("latitude");
        expect(mappings.longitudePath).toBe("longitude");
        expect(mappings.locationPath).toBe("address");
      });

      it("should detect only coordinates when no location field exists", () => {
        const fieldStats = createFieldStats({
          lat: { fieldType: "latitude" },
          lon: { fieldType: "longitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBe("lat");
        expect(mappings.longitudePath).toBe("lon");
        expect(mappings.locationPath).toBeNull();
      });

      it("should detect only location when no coordinates exist", () => {
        const fieldStats = createFieldStats({
          venue: { fieldType: "location" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBeNull();
        expect(mappings.longitudePath).toBeNull();
        expect(mappings.locationPath).toBe("venue");
      });

      it("should return all nulls when no geo fields exist", () => {
        const fieldStats = createFieldStats({
          title: { fieldType: "title" },
          description: { fieldType: "description" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        expect(mappings.latitudePath).toBeNull();
        expect(mappings.longitudePath).toBeNull();
        expect(mappings.locationPath).toBeNull();
      });
    });

    describe("Confidence scoring", () => {
      it("should prefer exact coordinate field names over partial matches", () => {
        const fieldStats = createFieldStats({
          lat: { fieldType: "latitude" },
          location_lat: { fieldType: "latitude" },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        // 'lat' should win over 'location_lat' due to higher specificity
        expect(mappings.latitudePath).toBe("lat");
      });

      it("should prefer fields with better data consistency", () => {
        const fieldStats = createFieldStats({
          lat_deg: {
            uniqueSamples: [40.7, 41.8, 42.9],
            typeDistribution: { number: 90, string: 10 },
            numericStats: { min: 40.7, max: 42.9, avg: 41.8, isInteger: false },
          },
          lat: {
            uniqueSamples: [40.7, 41.8, 42.9],
            typeDistribution: { number: 100 },
            numericStats: { min: 40.7, max: 42.9, avg: 41.8, isInteger: false },
          },
        });

        const mappings = detectFieldMappings(fieldStats, "eng");

        // 'lat' should win due to better pattern match (more specific) even though lat_deg has good consistency too
        expect(mappings.latitudePath).toBe("lat");
      });
    });
  });
});

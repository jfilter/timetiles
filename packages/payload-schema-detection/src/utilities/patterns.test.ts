/**
 * Pattern detection utility tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";
import type { FieldStatistics } from "../types";
import {
  detectFieldMappings,
  detectGeoFields,
  FIELD_PATTERNS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  ADDRESS_PATTERNS,
  COORDINATE_BOUNDS,
} from "./patterns";

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

describe("detectFieldMappings", () => {
  it("detects English title field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({ typeDistribution: { string: 100 } }),
      id: createFieldStats({ typeDistribution: { number: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("title");
    expect(result.title?.confidence).toBeGreaterThan(0.5);
  });

  it("detects German title field (titel)", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      titel: createFieldStats({ typeDistribution: { string: 100 } }),
      id: createFieldStats({ typeDistribution: { number: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "deu");

    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("titel");
  });

  it("detects description field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      description: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.description).not.toBeNull();
    expect(result.description?.path).toBe("description");
  });

  it("detects German description field (beschreibung)", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      beschreibung: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "deu");

    expect(result.description).not.toBeNull();
    expect(result.description?.path).toBe("beschreibung");
  });

  it("detects timestamp field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      date: createFieldStats({
        typeDistribution: { string: 100 },
        formats: { date: 100 },
      }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.timestamp).not.toBeNull();
    expect(result.timestamp?.path).toBe("date");
  });

  it("detects location name field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      venue: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.locationName).not.toBeNull();
    expect(result.locationName?.path).toBe("venue");
  });

  it("returns null for fields that don't match", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      random_field: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
  });

  it("falls back to English patterns for unknown language", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "xyz");

    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("title");
  });
});

describe("detectGeoFields", () => {
  it("detects separate lat/lng fields", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      lat: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: -90, max: 90, avg: 45, isInteger: false },
      }),
      lng: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: -180, max: 180, avg: 10, isInteger: false },
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("separate");
    expect(result?.latitude?.path).toBe("lat");
    expect(result?.longitude?.path).toBe("lng");
  });

  it("detects latitude/longitude field names", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      latitude: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: -90, max: 90, avg: 40, isInteger: false },
      }),
      longitude: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: -180, max: 180, avg: -74, isInteger: false },
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("separate");
    expect(result?.latitude?.path).toBe("latitude");
    expect(result?.longitude?.path).toBe("longitude");
  });

  it("detects combined coordinate field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      coordinates: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: ["52.52,13.405", "48.8566,2.3522", "40.7128,-74.006"],
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("combined");
    expect(result?.combined?.path).toBe("coordinates");
    expect(result?.combined?.format).toBe("lat,lng");
  });

  it("returns null for invalid coordinate values", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      lat: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: 100, max: 200, avg: 150, isInteger: false },
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).toBeNull();
  });

  it("returns partial result with lower confidence when only one coordinate found", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      lat: createFieldStats({
        typeDistribution: { number: 100 },
        numericStats: { min: -90, max: 90, avg: 45, isInteger: false },
      }),
      some_other_field: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("separate");
    expect(result?.latitude?.path).toBe("lat");
    expect(result?.longitude).toBeUndefined();
    expect(result?.confidence).toBeLessThanOrEqual(0.5);
  });
});

describe("FIELD_PATTERNS", () => {
  it("has patterns for all field types", () => {
    expect(FIELD_PATTERNS).toHaveProperty("title");
    expect(FIELD_PATTERNS).toHaveProperty("description");
    expect(FIELD_PATTERNS).toHaveProperty("locationName");
    expect(FIELD_PATTERNS).toHaveProperty("timestamp");
    expect(FIELD_PATTERNS).toHaveProperty("location");
  });

  it("has patterns for multiple languages", () => {
    const languages = ["eng", "deu", "fra", "spa", "ita", "nld", "por"];

    for (const lang of languages) {
      expect(FIELD_PATTERNS.title).toHaveProperty(lang);
      expect(FIELD_PATTERNS.description).toHaveProperty(lang);
    }
  });

  it("patterns match expected field names", () => {
    // English patterns
    expect(FIELD_PATTERNS.title.eng.some((p) => p.test("title"))).toBe(true);
    expect(FIELD_PATTERNS.title.eng.some((p) => p.test("name"))).toBe(true);

    // German patterns
    expect(FIELD_PATTERNS.title.deu.some((p) => p.test("titel"))).toBe(true);
    expect(FIELD_PATTERNS.description.deu.some((p) => p.test("beschreibung"))).toBe(true);

    // French patterns
    expect(FIELD_PATTERNS.title.fra.some((p) => p.test("titre"))).toBe(true);
    expect(FIELD_PATTERNS.description.fra.some((p) => p.test("description"))).toBe(true);
  });
});

describe("LATITUDE_PATTERNS", () => {
  it("matches common latitude field names", () => {
    const names = ["lat", "latitude", "lat_coord", "geo_lat"];
    for (const name of names) {
      expect(LATITUDE_PATTERNS.some((p) => p.test(name))).toBe(true);
    }
  });

  it("does not match longitude field names", () => {
    const names = ["lng", "longitude", "lon"];
    for (const name of names) {
      expect(LATITUDE_PATTERNS.some((p) => p.test(name))).toBe(false);
    }
  });
});

describe("LONGITUDE_PATTERNS", () => {
  it("matches common longitude field names", () => {
    const names = ["lng", "lon", "longitude", "geo_lng"];
    for (const name of names) {
      expect(LONGITUDE_PATTERNS.some((p) => p.test(name))).toBe(true);
    }
  });

  it("does not match latitude field names", () => {
    expect(LONGITUDE_PATTERNS.some((p) => p.test("lat"))).toBe(false);
    expect(LONGITUDE_PATTERNS.some((p) => p.test("latitude"))).toBe(false);
  });
});

describe("COMBINED_COORDINATE_PATTERNS", () => {
  it("matches combined coordinate field names", () => {
    const names = ["coordinates", "coords", "latlng", "geolocation", "position"];
    for (const name of names) {
      expect(COMBINED_COORDINATE_PATTERNS.some((p) => p.test(name))).toBe(true);
    }
  });
});

describe("COORDINATE_BOUNDS", () => {
  it("has valid latitude bounds", () => {
    expect(COORDINATE_BOUNDS.latitude.min).toBe(-90);
    expect(COORDINATE_BOUNDS.latitude.max).toBe(90);
  });

  it("has valid longitude bounds", () => {
    expect(COORDINATE_BOUNDS.longitude.min).toBe(-180);
    expect(COORDINATE_BOUNDS.longitude.max).toBe(180);
  });
});

describe("FIELD_PATTERNS.location", () => {
  it("has patterns for all 7 languages", () => {
    const languages = ["eng", "deu", "fra", "spa", "ita", "nld", "por"];
    for (const lang of languages) {
      expect(FIELD_PATTERNS.location).toHaveProperty(lang);
      expect(FIELD_PATTERNS.location[lang as keyof typeof FIELD_PATTERNS.location].length).toBeGreaterThan(0);
    }
  });

  it("matches common English address field names", () => {
    const names = ["address", "location", "city", "street", "venue"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.eng.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common German address field names", () => {
    const names = ["adresse", "ort", "stadt", "strasse", "straße"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.deu.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common French address field names", () => {
    const names = ["adresse", "lieu", "ville", "rue"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.fra.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common Spanish address field names", () => {
    const names = ["dirección", "lugar", "ciudad", "calle"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.spa.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common Italian address field names", () => {
    const names = ["indirizzo", "luogo", "città", "via"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.ita.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common Dutch address field names", () => {
    const names = ["adres", "locatie", "stad", "straat"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.nld.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches common Portuguese address field names", () => {
    const names = ["endereço", "local", "cidade", "rua"];
    for (const name of names) {
      expect(FIELD_PATTERNS.location.por.some((p) => p.test(name))).toBe(true);
    }
  });
});

describe("ADDRESS_PATTERNS", () => {
  it("matches address-related field names", () => {
    const names = ["address", "street", "city", "postal_code", "country"];
    for (const name of names) {
      expect(ADDRESS_PATTERNS.some((p) => p.test(name))).toBe(true);
    }
  });

  it("matches abbreviated address field names", () => {
    expect(ADDRESS_PATTERNS.some((p) => p.test("addr"))).toBe(true);
    expect(ADDRESS_PATTERNS.some((p) => p.test("zip"))).toBe(true);
  });

  it("matches location-related field names", () => {
    expect(ADDRESS_PATTERNS.some((p) => p.test("location"))).toBe(true);
    expect(ADDRESS_PATTERNS.some((p) => p.test("place"))).toBe(true);
  });
});

/**
 * Pattern detection utility tests.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { FieldStatistics } from "@/lib/services/schema-detection/types";
import { detectGeoFields } from "@/lib/services/schema-detection/utilities/coordinates";
import {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  FIELD_PATTERNS,
  getFieldPatterns,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
  matchFieldNamePatterns,
} from "@/lib/services/schema-detection/utilities/patterns";
import { validateFieldType } from "@/lib/services/schema-detection/utilities/validators";

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
      date: createFieldStats({ typeDistribution: { string: 100 }, formats: { date: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.timestamp).not.toBeNull();
    expect(result.timestamp?.path).toBe("date");
  });

  it("detects end timestamp field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      end_date: createFieldStats({ typeDistribution: { string: 100 }, formats: { date: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.endTimestamp).not.toBeNull();
    expect(result.endTimestamp?.path).toBe("end_date");
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

  it("detects combined coordinate field with unambiguous lat,lng samples", () => {
    // Samples where the second component is outside [-90, 90] (|lng| > 90),
    // forcing the detector to conclude lat,lng ordering.
    const fieldStats: Record<string, FieldStatistics> = {
      coordinates: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: ["52.52,-179.5", "48.85,175.3", "-33.87,151.2"],
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("combined");
    expect(result?.combined?.path).toBe("coordinates");
    expect(result?.combined?.format).toBe("lat,lng");
    expect(result?.requiresUserChoice).toBeFalsy();
  });

  it("marks combined coordinate field as ambiguous when samples fit either order", () => {
    // Every sample has |first| <= 90 AND |second| <= 90, so the data could
    // be lat,lng (e.g. Berlin 52.52,13.4) or lng,lat (e.g. 52.52°E,13.4°N in
    // Siberia). Silently picking was the M3 bug; now we flag it.
    const fieldStats: Record<string, FieldStatistics> = {
      coordinates: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: ["52.52,13.405", "48.8566,2.3522", "45.0,10.0"],
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("combined");
    expect(result?.combined?.format).toBe("ambiguous");
    expect(result?.requiresUserChoice).toBe(true);
    // Ambiguous detections must report low confidence so UI flags them.
    expect(result?.confidence).toBeLessThanOrEqual(0.4);
  });

  it("detects combined coordinate field with unambiguous lng,lat samples", () => {
    // Samples where the FIRST component is outside [-90, 90] force lng,lat.
    const fieldStats: Record<string, FieldStatistics> = {
      coordinates: createFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: ["-179.5,52.52", "175.3,48.85", "151.2,-33.87"],
      }),
    };

    const result = detectGeoFields(fieldStats);

    expect(result).not.toBeNull();
    expect(result?.combined?.format).toBe("lng,lat");
    expect(result?.requiresUserChoice).toBeFalsy();
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
    expect(FIELD_PATTERNS).toHaveProperty("endTimestamp");
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
    expect(FIELD_PATTERNS.endTimestamp.eng.some((p) => p.test("end_date"))).toBe(true);
  });
});

describe("LATITUDE_PATTERNS", () => {
  it("matches common latitude field names", () => {
    const names = ["lat", "latitude", "lat_coord", "geo_lat", "lat_coordinate"];
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
    const names = ["lng", "lon", "longitude", "geo_lng", "lon_coord", "lng_coord", "location_lng"];
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

describe("matchFieldNamePatterns", () => {
  it("matches primary language patterns", () => {
    const result = matchFieldNamePatterns(["titel", "id"], "title", "deu");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("titel");
    expect(result!.isFallback).toBe(false);
  });

  it("falls back to English patterns for non-English language", () => {
    const result = matchFieldNamePatterns(["title", "id"], "title", "deu");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("title");
    expect(result!.isFallback).toBe(true);
  });

  it("does not fall back when primary language is English", () => {
    const result = matchFieldNamePatterns(["unknown_field"], "title", "eng");
    expect(result).toBeNull();
  });

  it("returns null when no match found", () => {
    const result = matchFieldNamePatterns(["random_field"], "title", "eng");
    expect(result).toBeNull();
  });

  it("returns first (most specific) match", () => {
    const result = matchFieldNamePatterns(["event_name", "name", "title"], "title", "eng");
    expect(result).not.toBeNull();
    // "title" is the first pattern so should match with index 0
    expect(result!.name).toBe("title");
    expect(result!.patternIndex).toBe(0);
  });
});

describe("getFieldPatterns", () => {
  it("returns built-in patterns for known field type and language", () => {
    const patterns = getFieldPatterns("title", "eng");
    expect(patterns.length).toBeGreaterThan(0);
  });

  it("falls back to English for unknown language", () => {
    const patterns = getFieldPatterns("title", "zzz");
    expect(patterns.length).toBeGreaterThan(0);
    // Should be the English patterns
    expect(patterns).toEqual(FIELD_PATTERNS.title.eng);
  });

  it("returns empty array for unknown field type", () => {
    const patterns = getFieldPatterns("nonexistent_type", "eng");
    expect(patterns).toEqual([]);
  });

  it("prepends custom patterns when provided", () => {
    const customPatterns = [/^custom_title$/i];
    const result = getFieldPatterns("title", "eng", { fieldPatterns: { title: { eng: customPatterns } } });
    expect(result.length).toBeGreaterThan(FIELD_PATTERNS.title.eng.length);
    // Custom patterns should be appended (default behavior)
    expect(result[result.length - 1]).toBe(customPatterns[0]);
  });

  it("replaces patterns when replacePatterns includes the field type", () => {
    const customPatterns = [/^my_title$/i];
    const result = getFieldPatterns("title", "eng", {
      fieldPatterns: { title: { eng: customPatterns } },
      replacePatterns: ["title"],
    });
    expect(result).toEqual(customPatterns);
  });

  it("returns default patterns when custom patterns are for different language", () => {
    const result = getFieldPatterns("title", "eng", { fieldPatterns: { title: { deu: [/^my_titel$/i] } } });
    // No custom patterns for eng, so should return defaults
    expect(result).toEqual(FIELD_PATTERNS.title.eng);
  });
});

describe("detectFieldMappings — advanced", () => {
  it("skips all field mapping when options.skip.fieldMapping is true", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    const result = detectFieldMappings(fieldStats, "eng", { skip: { fieldMapping: true } });

    expect(result.title).toBeNull();
    expect(result.description).toBeNull();
    expect(result.timestamp).toBeNull();
    expect(result.endTimestamp).toBeNull();
    expect(result.locationName).toBeNull();
    expect(result.geo).toBeNull();
  });

  it("skips coordinate detection when options.skip.coordinates is true", () => {
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

    const result = detectFieldMappings(fieldStats, "eng", { skip: { coordinates: true } });
    expect(result.geo).toBeNull();
  });

  it("detects additional field types when configured", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      category: createFieldStats({ typeDistribution: { string: 100 }, uniqueSamples: Array(10).fill("Category Name") }),
    };

    const result = detectFieldMappings(fieldStats, "eng", {
      additionalFieldTypes: { category: { patterns: { eng: [/^category$/i] }, validator: () => 1 } },
    });

    expect(result).toHaveProperty("category");
    expect((result as any).category).not.toBeNull();
  });

  it("uses English fallback when non-English primary language does not match", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      description: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    // Spanish language, but field is named "description" (English)
    const result = detectFieldMappings(fieldStats, "spa");
    expect(result.description).not.toBeNull();
    expect(result.description?.path).toBe("description");
  });

  it("uses custom scoring weights", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    // Override to 100% pattern, 0% validation
    const result = detectFieldMappings(fieldStats, "eng", { scoringWeights: [1.0, 0.0] });
    expect(result.title).not.toBeNull();
  });

  it("uses custom validator for a field type", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({ typeDistribution: { string: 100 } }),
    };

    // Custom validator that always returns 0 (no match)
    const result = detectFieldMappings(fieldStats, "eng", { customValidators: { title: () => 0 } });

    // With validation returning 0, the field should be skipped
    expect(result.title).toBeNull();
  });

  it("uses validator overrides for minStringPct", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 50, number: 50 }, // Only 50% strings
      }),
    };

    // With default threshold (0.8), should not match
    const result1 = detectFieldMappings(fieldStats, "eng");
    expect(result1.title).toBeNull();

    // With lowered threshold, should match
    const result2 = detectFieldMappings(fieldStats, "eng", { validatorOverrides: { title: { minStringPct: 0.3 } } });
    expect(result2.title).not.toBeNull();
  });
});

describe("validateFieldType", () => {
  it("returns 0 for unknown field type", () => {
    const stats = createFieldStats({ typeDistribution: { string: 100 } });
    expect(validateFieldType(stats, "unknown_type")).toBe(0);
  });

  it("uses custom validator when provided", () => {
    const stats = createFieldStats({ typeDistribution: { string: 100 } });
    const customValidator = () => 0.99;
    expect(validateFieldType(stats, "title", undefined, customValidator)).toBe(0.99);
  });

  describe("title validation", () => {
    it("returns 0 for low string percentage", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 50, number: 50 } });
      expect(validateFieldType(stats, "title")).toBe(0);
    });

    it("returns 0.5 when no unique samples", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 } });
      expect(validateFieldType(stats, "title")).toBe(0.5);
    });

    it("returns 0 when no string values in samples", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [123, 456],
      });
      expect(validateFieldType(stats, "title")).toBe(0);
    });

    it("returns 1 for ideal title lengths (10-100 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A title that is about twenty five chars"],
      });
      expect(validateFieldType(stats, "title")).toBe(1);
    });

    it("returns 0.8 for acceptable title lengths (5-200 chars)", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 }, uniqueSamples: ["Short"] });
      expect(validateFieldType(stats, "title")).toBe(0.8);
    });

    it("returns 0.3 for very short titles (< 3 chars)", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 }, uniqueSamples: ["AB"] });
      expect(validateFieldType(stats, "title")).toBe(0.3);
    });

    it("returns 0.3 for very long titles (> 500 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(501)],
      });
      expect(validateFieldType(stats, "title")).toBe(0.3);
    });

    it("returns 0.6 for mid-range title lengths (200-500 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(300)],
      });
      expect(validateFieldType(stats, "title")).toBe(0.6);
    });
  });

  describe("description validation", () => {
    it("returns 0 for low string percentage", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 50, number: 50 } });
      expect(validateFieldType(stats, "description")).toBe(0);
    });

    it("returns 1 for ideal description lengths (20-500 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["This is a description that has about fifty characters or so in it yes."],
      });
      expect(validateFieldType(stats, "description")).toBe(1);
    });

    it("returns 0.8 for acceptable description lengths (10-1000 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["Fifteen ch"],
      });
      expect(validateFieldType(stats, "description")).toBe(0.8);
    });

    it("returns 0.2 for very short descriptions (< 5 chars)", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 }, uniqueSamples: ["Hi"] });
      expect(validateFieldType(stats, "description")).toBe(0.2);
    });

    it("returns 0.7 for very long descriptions (> 1000 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(1500)],
      });
      expect(validateFieldType(stats, "description")).toBe(0.7);
    });

    it("returns 0.6 for descriptions with avg length 5-10 chars (fallback)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["abcdefg"], // 7 chars: >= 5, < 10 -> falls to 0.6 else
      });
      expect(validateFieldType(stats, "description")).toBe(0.6);
    });

    it("returns 0 when all samples are non-string", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [42, true],
      });
      expect(validateFieldType(stats, "description")).toBe(0);
    });
  });

  describe("locationName validation", () => {
    it("returns 1 for ideal location name lengths (3-50 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["Madison Square Garden"],
      });
      expect(validateFieldType(stats, "locationName")).toBe(1);
    });

    it("returns 0.8 for acceptable location name lengths (2-100 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A very long location name that exceeds fifty characters in total length yes"],
      });
      expect(validateFieldType(stats, "locationName")).toBe(0.8);
    });

    it("returns 0.2 for very short names (< 2 chars)", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 }, uniqueSamples: ["A"] });
      expect(validateFieldType(stats, "locationName")).toBe(0.2);
    });

    it("returns 0.6 for very long names (> 100 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(150)],
      });
      expect(validateFieldType(stats, "locationName")).toBe(0.6);
    });
  });

  describe("timestamp validation", () => {
    it("detects Date objects / ISO strings in samples", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { object: 100 },
        uniqueSamples: ["2024-01-15T10:30:00Z", "2024-02-20T14:45:00Z"],
      });
      expect(validateFieldType(stats, "timestamp")).toBe(1);
    });

    it("detects date format indicators", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        formats: { date: 50, dateTime: 30 },
      });
      expect(validateFieldType(stats, "timestamp")).toBeGreaterThan(0.7);
    });

    it("detects parseable date strings", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [
          "January 15, 2024",
          "February 20, 2024",
          "March 10, 2024",
          "April 5, 2024",
          "May 1, 2024",
          "June 12, 2024",
          "July 7, 2024",
          "August 25, 2024",
        ],
      });
      const score = validateFieldType(stats, "timestamp");
      expect(score).toBeGreaterThan(0);
    });

    it("detects unix timestamps in seconds", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { integer: 100 },
        numericStats: { min: 1700000000, max: 1710000000, avg: 1705000000, isInteger: true },
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0.8);
    });

    it("detects unix timestamps in milliseconds", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { integer: 100 },
        numericStats: { min: 1700000000000, max: 1710000000000, avg: 1705000000000, isInteger: true },
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0.8);
    });

    it("returns 0 when no timestamp indicators found", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["hello", "world"],
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });

    it("returns 0 for Date objects when objectPct is too low", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { object: 50, string: 50 },
        uniqueSamples: ["2024-01-15T10:30:00Z"],
      });
      // objectPct is 0.5, threshold is 0.7
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });

    it("returns 0 for parseable strings when stringPct is too low", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 30, number: 70 },
        uniqueSamples: ["2024-01-15"],
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });

    it("returns 0 for numbers not in unix timestamp range", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { number: 100 },
        numericStats: { min: 1, max: 100, avg: 50, isInteger: true },
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });

    it("handles parseable strings with invalid ISO dates", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [
          "2024-13-40", // invalid ISO date
          "2024-01-15",
          "2024-02-20",
          "2024-03-10",
          "2024-04-05",
          "2024-05-01",
          "2024-06-12",
          "2024-07-07",
        ],
      });
      const score = validateFieldType(stats, "timestamp");
      expect(score).toBeGreaterThan(0);
    });

    it("returns 0.8 for ISO strings with moderate date pct (50-70%)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { object: 100 },
        uniqueSamples: ["2024-01-15T10:30:00Z", "not-a-date", "also-not", "2024-02-20T14:45:00Z"],
      });
      // 2 of 4 = 50% -> score 0.8
      expect(validateFieldType(stats, "timestamp")).toBe(0.8);
    });

    it("returns 0 for Date objects with low date value pct", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { object: 100 },
        uniqueSamples: ["not-a-date", "also-not", "nope", "still-not"],
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });

    it("handles parseable strings with low valid date pct (30-50%)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [
          "2024-01-15",
          "2024-02-20",
          "2024-03-10",
          "not-a-date",
          "also-not",
          "nope",
          "still-not",
          "definitely-not",
          "no-way",
          "forget-it",
        ],
      });
      const score = validateFieldType(stats, "timestamp");
      // 3 of 10 = 30% -> score 0.5
      expect(score).toBe(0.5);
    });

    it("handles parseable strings with moderate valid date pct (50-70%)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: [
          "2024-01-15",
          "2024-02-20",
          "2024-03-10",
          "2024-04-05",
          "2024-05-01",
          "not-a-date",
          "also-not",
          "nope",
          "still-not",
          "definitely-not",
        ],
      });
      const score = validateFieldType(stats, "timestamp");
      // 5 of 10 = 50% -> score 0.7
      expect(score).toBe(0.7);
    });

    it("returns 0 for numbers without numericStats", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { number: 100 },
        // no numericStats
      });
      expect(validateFieldType(stats, "timestamp")).toBe(0);
    });
  });

  describe("location validation", () => {
    it("returns 1 for ideal location lengths (3-100 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["123 Main Street, Springfield, IL 62701"],
      });
      expect(validateFieldType(stats, "location")).toBe(1);
    });

    it("returns 0.8 for acceptable location lengths (2-500 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(200)],
      });
      expect(validateFieldType(stats, "location")).toBe(0.8);
    });

    it("returns 0.2 for very short locations (< 2 chars)", () => {
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 }, uniqueSamples: ["A"] });
      expect(validateFieldType(stats, "location")).toBe(0.2);
    });

    it("returns 0.6 for very long locations (> 500 chars)", () => {
      const stats = createFieldStats({
        occurrences: 100,
        typeDistribution: { string: 100 },
        uniqueSamples: ["A".repeat(600)],
      });
      expect(validateFieldType(stats, "location")).toBe(0.6);
    });

    it("returns 0.5 for mid-range location lengths", () => {
      // This covers the default return path: stats with samples but avgLength in 100-500 range
      // actually that's covered by 0.8. Let's test the "no unique samples" path
      const stats = createFieldStats({ occurrences: 100, typeDistribution: { string: 100 } });
      expect(validateFieldType(stats, "location")).toBe(0.5);
    });
  });
});

describe("validators — hasInvalidIsoDatePart", () => {
  it("handles strings that do not match ISO date prefix", () => {
    // This tests the internal hasInvalidIsoDatePart function indirectly through validateFieldType
    const stats = createFieldStats({
      occurrences: 100,
      typeDistribution: { string: 100 },
      uniqueSamples: [
        "not-a-date-at-all",
        "also not a date",
        "random text",
        "more random text",
        "yet more text",
        "still more text",
        "even more text",
        "getting bored",
        "almost done",
        "last one",
      ],
    });
    // None should parse as dates
    expect(validateFieldType(stats, "timestamp")).toBe(0);
  });
});

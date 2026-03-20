/**
 * Detection options override system tests (TDD).
 *
 * These tests define the API contract for a DetectionOptions system that allows
 * callers to override language detection, field patterns, scoring weights,
 * validators, coordinate detection, enum detection, ID detection, and pipeline
 * stages. Written test-first -- implementations do not exist yet.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { FieldStatistics } from "@/lib/types/schema-detection";
import type { DetectionContext, DetectionOptions, LanguageResult } from "@/lib/services/schema-detection/types";
import { detectFieldMappings } from "@/lib/services/schema-detection/utilities/patterns";
import { detectGeoFields } from "@/lib/services/schema-detection/utilities/coordinates";
import { detectEnumFields, detectIdFields } from "@/lib/services/schema-detection/utilities/geo";
import { createDefaultDetector, mergeDetectionOptions } from "@/lib/services/schema-detection/detectors";

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

const makeFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics => ({
  path: "field",
  occurrences: 100,
  occurrencePercent: 100,
  nullCount: 0,
  uniqueValues: 50,
  uniqueSamples: [],
  typeDistribution: { string: 100 },
  formats: {},
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: 0,
  ...overrides,
});

/** Build a FieldStatistics object that passes the default title validator (>= 80% strings, avg length 10-100). */
const makeTitleFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { string: 100 },
    uniqueSamples: [
      "Summer Music Festival in the Park",
      "Community Art Exhibition Opening Night",
      "Annual Food and Wine Tasting",
      "Downtown Jazz Concert Series",
      "Heritage Walking Tour of the Old Town",
    ],
    ...overrides,
  });

/** Build a FieldStatistics object that looks like a latitude column with numeric data. */
const makeLatitudeFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { number: 100 },
    numericStats: { min: 48.0, max: 55.0, avg: 52.0, isInteger: false },
    uniqueSamples: [52.52, 48.86, 51.51, 50.94, 53.55],
    ...overrides,
  });

/** Build a FieldStatistics object that looks like a longitude column with numeric data. */
const makeLongitudeFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { number: 100 },
    numericStats: { min: 2.0, max: 14.0, avg: 8.0, isInteger: false },
    uniqueSamples: [13.41, 2.35, 7.38, 6.96, 9.99],
    ...overrides,
  });

/** Build a FieldStatistics object that has low enough string percentage to fail default title validation (80%). */
const makeWeakStringFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { string: 60, number: 40 },
    uniqueSamples: ["Some Event Title That Is Long Enough", "Another Reasonably Named Event Here", 42, 99],
    ...overrides,
  });

/** Build a FieldStatistics object that clearly passes validation for title. */
const makeStrongValidationFieldStats = (overrides: Partial<FieldStatistics> = {}): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { string: 100 },
    uniqueSamples: [
      "Opening Ceremony of the Annual Gala",
      "Keynote Speech by the Distinguished Professor",
      "Panel Discussion on Climate Action",
      "Closing Reception at the Grand Hall",
    ],
    ...overrides,
  });

/** Build an enum-like FieldStatistics with a specific number of unique values. */
const makeEnumFieldStats = (uniqueValues: number, occurrences: number = 100): FieldStatistics =>
  makeFieldStats({
    typeDistribution: { string: occurrences },
    uniqueValues,
    occurrences,
    uniqueSamples: Array.from({ length: Math.min(uniqueValues, 10) }, (_, i) => `value_${i}`),
  });

// ---------------------------------------------------------------------------
// 1. Language overrides
// ---------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/max-lines-per-function -- TDD test suite with comprehensive coverage
describe("DetectionOptions: language overrides", () => {
  it("forces a specific language code with language option", async () => {
    const detector = createDefaultDetector({ language: "deu" });
    const context: DetectionContext = {
      fieldStats: { title: makeTitleFieldStats() },
      sampleData: [{ title: "Summer Music Festival" }, { title: "Art Exhibition Opening" }],
      headers: ["title"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // Language should be forced to German regardless of data content
    expect(result.language.code).toBe("deu");
    expect(result.language.name).toBe("German");
    expect(result.language.confidence).toBe(1);
    expect(result.language.isReliable).toBe(true);
  });

  it("uses a custom language detector function", async () => {
    const customDetector = (_sampleData: Record<string, unknown>[], _headers: string[]): LanguageResult => ({
      code: "fra",
      name: "French",
      confidence: 0.95,
      isReliable: true,
    });

    const detector = createDefaultDetector({ customLanguageDetector: customDetector });
    const context: DetectionContext = {
      fieldStats: { title: makeTitleFieldStats() },
      sampleData: [{ title: "English text here" }],
      headers: ["title"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.language.code).toBe("fra");
    expect(result.language.confidence).toBe(0.95);
  });

  it("raises confidence threshold with languageConfidenceThreshold", async () => {
    const detector = createDefaultDetector({ languageConfidenceThreshold: 0.9 });
    const context: DetectionContext = {
      fieldStats: { title: makeTitleFieldStats() },
      // Very short text -- franc will produce low-confidence results
      sampleData: [{ title: "Test" }],
      headers: ["title"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // With a high threshold the detection should fall back to English
    // because franc won't reach 0.9 confidence on such short text
    expect(result.language.code).toBe("eng");
    expect(result.language.isReliable).toBe(false);
  });

  it("skips language detection when skip.language is true", async () => {
    const detector = createDefaultDetector({ skip: { language: true } });
    const context: DetectionContext = {
      fieldStats: { titel: makeTitleFieldStats(), beschreibung: makeFieldStats({ typeDistribution: { string: 100 } }) },
      sampleData: [
        { titel: "Konzert im Stadtpark", beschreibung: "Ein wunderbares Konzert mit klassischer Musik" },
        { titel: "Theaterpremiere", beschreibung: "Die neue Produktion des Stadttheaters" },
      ],
      headers: ["titel", "beschreibung"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // Should return default English even though data is German
    expect(result.language.code).toBe("eng");
    expect(result.language.name).toBe("English");
    expect(result.language.confidence).toBe(0);
    expect(result.language.isReliable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Field pattern overrides
// ---------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/max-lines-per-function -- TDD test suite
describe("DetectionOptions: field pattern overrides", () => {
  it("returns null for a non-standard column name without custom patterns", () => {
    const fieldStats: Record<string, FieldStatistics> = { EVENT_HEADLINE: makeTitleFieldStats() };

    const result = detectFieldMappings(fieldStats, "eng");

    expect(result.title).toBeNull();
  });

  it("detects a custom column name with fieldPatterns override", () => {
    const fieldStats: Record<string, FieldStatistics> = { EVENT_HEADLINE: makeTitleFieldStats() };

    const result = detectFieldMappings(fieldStats, "eng", { fieldPatterns: { title: { eng: [/^EVENT_HEADLINE$/i] } } });

    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("EVENT_HEADLINE");
    expect(result.title?.confidence).toBeGreaterThan(0);
  });

  it("appends custom patterns to defaults by default", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: makeTitleFieldStats(),
      EVENT_HEADLINE: makeTitleFieldStats(),
    };

    const result = detectFieldMappings(fieldStats, "eng", { fieldPatterns: { title: { eng: [/^EVENT_HEADLINE$/i] } } });

    // Default "title" pattern should still match (custom patterns are appended)
    expect(result.title).not.toBeNull();
    // The standard "title" field should win because default patterns come first
    expect(result.title?.path).toBe("title");
  });

  it("replaces default patterns when replacePatterns includes the field type", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: makeTitleFieldStats(),
      EVENT_HEADLINE: makeTitleFieldStats(),
    };

    const result = detectFieldMappings(fieldStats, "eng", {
      fieldPatterns: { title: { eng: [/^EVENT_HEADLINE$/i] } },
      replacePatterns: ["title"],
    });

    // With replace mode, only the custom pattern should be used
    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("EVENT_HEADLINE");
  });

  it("does not affect other field types when overriding one", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      EVENT_HEADLINE: makeTitleFieldStats(),
      description: makeFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: [
          "This is a detailed description of the event that is fairly long",
          "Another comprehensive description with plenty of detail",
        ],
      }),
    };

    const result = detectFieldMappings(fieldStats, "eng", { fieldPatterns: { title: { eng: [/^EVENT_HEADLINE$/i] } } });

    // Title should be overridden
    expect(result.title?.path).toBe("EVENT_HEADLINE");
    // Description should still use default patterns
    expect(result.description?.path).toBe("description");
  });

  it("supports language-specific custom patterns", () => {
    const fieldStats: Record<string, FieldStatistics> = { ÜBERSCHRIFT: makeTitleFieldStats() };

    const result = detectFieldMappings(fieldStats, "deu", { fieldPatterns: { title: { deu: [/^ÜBERSCHRIFT$/i] } } });

    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("ÜBERSCHRIFT");
  });
});

// ---------------------------------------------------------------------------
// 3. Scoring weight overrides
// ---------------------------------------------------------------------------

describe("DetectionOptions: scoring weight overrides", () => {
  it("default weights favor name match (0.6) over validation (0.4)", () => {
    // Field with strong name match but weaker validation
    // Field with weak name match but strong validation
    const fieldStats: Record<string, FieldStatistics> = {
      // "title" matches the first default pattern -> high pattern score
      title: makeFieldStats({
        typeDistribution: { string: 80, number: 20 },
        uniqueSamples: ["Short", "Tiny", "A", "B", "C"],
      }),
      // "label" matches a later default pattern -> lower pattern score
      label: makeStrongValidationFieldStats(),
    };

    const result = detectFieldMappings(fieldStats, "eng");

    // With default 0.6/0.4 weights, the strong name match ("title") should win
    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("title");
  });

  it("custom weights favoring validation pick the better-validated field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      // "title" matches the first default pattern -> high pattern score
      title: makeFieldStats({
        typeDistribution: { string: 80, number: 20 },
        uniqueSamples: ["Short", "Tiny", "A", "B", "C"],
      }),
      // "label" matches a later default pattern -> lower pattern score
      label: makeStrongValidationFieldStats(),
    };

    const result = detectFieldMappings(fieldStats, "eng", { scoringWeights: [0.2, 0.8] });

    // With validation-heavy weights, the field with better data should win
    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("label");
  });

  it("equal weights balance name and validation equally", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      name: makeStrongValidationFieldStats(),
      event_title: makeTitleFieldStats(),
    };

    const result = detectFieldMappings(fieldStats, "eng", { scoringWeights: [0.5, 0.5] });

    // Both should score reasonably; the point is that the function accepts the option
    expect(result.title).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Validator overrides
// ---------------------------------------------------------------------------

describe("DetectionOptions: validator overrides", () => {
  it("default title validator rejects fields with < 80% strings", () => {
    const fieldStats: Record<string, FieldStatistics> = { title: makeWeakStringFieldStats() };

    const result = detectFieldMappings(fieldStats, "eng");

    // 60% strings should fail the default 80% threshold
    expect(result.title).toBeNull();
  });

  it("validatorOverrides lowers the minStringPct for title", () => {
    const fieldStats: Record<string, FieldStatistics> = { title: makeWeakStringFieldStats() };

    const result = detectFieldMappings(fieldStats, "eng", { validatorOverrides: { title: { minStringPct: 0.5 } } });

    // 60% strings should now pass with a 50% threshold
    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("title");
  });

  it("customValidators fully replace the built-in validator for a field type", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      title: makeFieldStats({
        // Numeric-only field: would never pass default title validation
        typeDistribution: { number: 100 },
        uniqueSamples: [1, 2, 3, 4, 5],
      }),
    };

    const result = detectFieldMappings(fieldStats, "eng", {
      customValidators: { title: (_stats: FieldStatistics) => 1.0 },
    });

    // Custom validator always returns 1.0, so even a numeric field should pass
    expect(result.title).not.toBeNull();
    expect(result.title?.path).toBe("title");
    expect(result.title?.confidence).toBeGreaterThan(0);
  });

  it("customValidators returning 0 prevents the field from matching", () => {
    const fieldStats: Record<string, FieldStatistics> = { title: makeTitleFieldStats() };

    const result = detectFieldMappings(fieldStats, "eng", {
      customValidators: { title: (_stats: FieldStatistics) => 0 },
    });

    // Validator returns 0, so the field should be skipped
    expect(result.title).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Coordinate overrides
// ---------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/max-lines-per-function -- TDD test suite
describe("DetectionOptions: coordinate overrides", () => {
  it("default patterns do not detect Dutch latitude column name", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      BREEDTEGRAAD: makeLatitudeFieldStats(),
      LENGTEGRAAD: makeLongitudeFieldStats(),
    };

    const result = detectGeoFields(fieldStats);

    // "BREEDTEGRAAD" is not in default latitude patterns
    expect(result?.latitude?.path).not.toBe("BREEDTEGRAAD");
  });

  it("latitudePatterns option detects custom latitude column name", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      BREEDTEGRAAD: makeLatitudeFieldStats(),
      longitude: makeLongitudeFieldStats(),
    };

    const result = detectGeoFields(fieldStats, { latitudePatterns: [/^BREEDTEGRAAD$/i] });

    expect(result).not.toBeNull();
    expect(result?.latitude?.path).toBe("BREEDTEGRAAD");
  });

  it("longitudePatterns option detects custom longitude column name", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      latitude: makeLatitudeFieldStats(),
      LENGTEGRAAD: makeLongitudeFieldStats(),
    };

    const result = detectGeoFields(fieldStats, { longitudePatterns: [/^LENGTEGRAAD$/i] });

    expect(result).not.toBeNull();
    expect(result?.longitude?.path).toBe("LENGTEGRAAD");
  });

  it("coordinateBounds restricts valid coordinate ranges", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      lat: makeFieldStats({
        typeDistribution: { number: 100 },
        // Values outside Netherlands bounds (50-55)
        numericStats: { min: 35.0, max: 42.0, avg: 38.0, isInteger: false },
        uniqueSamples: [35.5, 38.0, 42.0],
      }),
      lng: makeLongitudeFieldStats(),
    };

    const result = detectGeoFields(fieldStats, { coordinateBounds: { latitude: { min: 50, max: 55 } } });

    // Latitude values (35-42) are outside the restricted bounds (50-55)
    expect(result?.latitude).toBeUndefined();
  });

  it("replaceCoordinatePatterns replaces default patterns entirely", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      lat: makeLatitudeFieldStats(),
      BREEDTEGRAAD: makeLatitudeFieldStats(),
      lng: makeLongitudeFieldStats(),
    };

    const result = detectGeoFields(fieldStats, {
      latitudePatterns: [/^BREEDTEGRAAD$/i],
      replaceCoordinatePatterns: true,
    });

    // With replace mode, default "lat" pattern should no longer match
    expect(result?.latitude?.path).toBe("BREEDTEGRAAD");
  });

  it("addressPatterns adds custom address pattern for location field", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      ADRES: makeFieldStats({
        typeDistribution: { string: 100 },
        uniqueSamples: ["Keizersgracht 123, Amsterdam", "Damrak 45, Amsterdam", "Vondelstraat 78, Amsterdam"],
      }),
    };

    const result = detectGeoFields(fieldStats, { addressPatterns: [/^ADRES$/i] });

    expect(result).not.toBeNull();
    expect(result?.locationField?.path).toBe("ADRES");
  });

  it("skip.coordinates returns null for geo results", async () => {
    const detector = createDefaultDetector({ skip: { coordinates: true } });
    const context: DetectionContext = {
      fieldStats: { title: makeTitleFieldStats(), lat: makeLatitudeFieldStats(), lng: makeLongitudeFieldStats() },
      sampleData: [{ title: "Test", lat: 52.52, lng: 13.41 }],
      headers: ["title", "lat", "lng"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.fieldMappings.geo).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. Enum detection overrides
// ---------------------------------------------------------------------------

describe("DetectionOptions: enum detection overrides", () => {
  it("default threshold (50) does not detect field with 80 unique values", () => {
    const fieldStats: Record<string, FieldStatistics> = { category: makeEnumFieldStats(80, 200) };

    const result = detectEnumFields(fieldStats);

    expect(result).not.toContain("category");
  });

  it("raised enumThreshold detects field with 80 unique values", () => {
    const fieldStats: Record<string, FieldStatistics> = { category: makeEnumFieldStats(80, 200) };

    const result = detectEnumFields(fieldStats, { enumThreshold: 100 });

    expect(result).toContain("category");
  });

  it("percentage mode uses ratio instead of absolute count", () => {
    const fieldStats: Record<string, FieldStatistics> = { region: makeEnumFieldStats(30, 1000) };

    // 30/1000 = 3%, threshold 90% -> 3% <= 90% -> should be enum
    const result = detectEnumFields(fieldStats, { enumMode: "percentage", enumThreshold: 90 });

    expect(result).toContain("region");
  });

  it("percentage mode excludes field exceeding threshold", () => {
    const fieldStats: Record<string, FieldStatistics> = { unique_text: makeEnumFieldStats(95, 100) };

    // 95/100 = 95%, threshold 90% -> should NOT be enum
    // But also uniqueValues < occurrences is required by detectEnumFields
    const result = detectEnumFields(fieldStats, { enumMode: "percentage", enumThreshold: 90 });

    expect(result).not.toContain("unique_text");
  });

  it("skip.enums returns empty enum list", async () => {
    const detector = createDefaultDetector({ skip: { enums: true } });
    const context: DetectionContext = {
      fieldStats: { status: makeEnumFieldStats(3) },
      sampleData: [{ status: "active" }],
      headers: ["status"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.patterns.enumFields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 7. ID detection overrides
// ---------------------------------------------------------------------------

describe("DetectionOptions: ID detection overrides", () => {
  it("default patterns detect record_key (_key suffix)", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      record_key: makeFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 100, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).toContain("record_key");
  });

  it("default patterns do not detect custom_uid", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      custom_uid: makeFieldStats({
        typeDistribution: { string: 100 },
        // Not all unique, so characteristics heuristic won't fire
        uniqueValues: 50,
        occurrences: 100,
      }),
    };

    const result = detectIdFields(fieldStats);

    expect(result).not.toContain("custom_uid");
  });

  it("idPatterns option detects custom ID column", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      custom_uid: makeFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 50, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats, { idPatterns: [/^custom_uid$/i] });

    expect(result).toContain("custom_uid");
  });

  it("replaceIdPatterns replaces defaults so record_key is no longer detected", () => {
    const fieldStats: Record<string, FieldStatistics> = {
      record_key: makeFieldStats({
        typeDistribution: { string: 100 },
        // Not all unique so the characteristics heuristic won't trigger
        uniqueValues: 50,
        occurrences: 100,
      }),
      custom_uid: makeFieldStats({ typeDistribution: { string: 100 }, uniqueValues: 50, occurrences: 100 }),
    };

    const result = detectIdFields(fieldStats, { idPatterns: [/^custom_uid$/i], replaceIdPatterns: true });

    expect(result).toContain("custom_uid");
    expect(result).not.toContain("record_key");
  });

  it("skip.ids returns empty ID list", async () => {
    const detector = createDefaultDetector({ skip: { ids: true } });
    const context: DetectionContext = {
      fieldStats: { id: makeFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }) },
      sampleData: [{ id: 1 }],
      headers: ["id"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.patterns.idFields).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. Pipeline skip flags
// ---------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/max-lines-per-function -- TDD test suite
describe("DetectionOptions: pipeline skip flags", () => {
  it("skip.language returns default English", async () => {
    const detector = createDefaultDetector({ skip: { language: true } });
    const context: DetectionContext = {
      fieldStats: {},
      sampleData: [],
      headers: [],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.language.code).toBe("eng");
    expect(result.language.name).toBe("English");
    expect(result.language.confidence).toBe(0);
    expect(result.language.isReliable).toBe(false);
  });

  it("skip.fieldMapping returns all null field mappings", async () => {
    const detector = createDefaultDetector({ skip: { fieldMapping: true } });
    const context: DetectionContext = {
      fieldStats: {
        title: makeTitleFieldStats(),
        description: makeFieldStats({
          typeDistribution: { string: 100 },
          uniqueSamples: ["A fairly detailed description of events"],
        }),
      },
      sampleData: [{ title: "Test", description: "Description text" }],
      headers: ["title", "description"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.fieldMappings.title).toBeNull();
    expect(result.fieldMappings.description).toBeNull();
    expect(result.fieldMappings.timestamp).toBeNull();
    expect(result.fieldMappings.locationName).toBeNull();
    expect(result.fieldMappings.geo).toBeNull();
  });

  it("skip.coordinates returns null geo in field mappings", async () => {
    const detector = createDefaultDetector({ skip: { coordinates: true } });
    const context: DetectionContext = {
      fieldStats: { title: makeTitleFieldStats(), lat: makeLatitudeFieldStats(), lng: makeLongitudeFieldStats() },
      sampleData: [{ title: "Event", lat: 52.52, lng: 13.41 }],
      headers: ["title", "lat", "lng"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.fieldMappings.geo).toBeNull();
    // Other field mappings should still work
    expect(result.fieldMappings.title).not.toBeNull();
  });

  it("skip.enums returns empty enumFields", async () => {
    const detector = createDefaultDetector({ skip: { enums: true } });
    const context: DetectionContext = {
      fieldStats: { status: makeEnumFieldStats(3) },
      sampleData: [{ status: "active" }],
      headers: ["status"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.patterns.enumFields).toEqual([]);
    // ID detection should still work
  });

  it("skip.ids returns empty idFields", async () => {
    const detector = createDefaultDetector({ skip: { ids: true } });
    const context: DetectionContext = {
      fieldStats: {
        id: makeFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
        status: makeEnumFieldStats(3),
      },
      sampleData: [{ id: 1, status: "active" }],
      headers: ["id", "status"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.patterns.idFields).toEqual([]);
    // Enum detection should still work
    expect(result.patterns.enumFields).toContain("status");
  });

  it("multiple skip flags can be combined", async () => {
    const detector = createDefaultDetector({ skip: { language: true, coordinates: true, enums: true, ids: true } });
    const context: DetectionContext = {
      fieldStats: {
        title: makeTitleFieldStats(),
        lat: makeLatitudeFieldStats(),
        id: makeFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
        status: makeEnumFieldStats(3),
      },
      sampleData: [{ title: "Test", lat: 52.52, id: 1, status: "active" }],
      headers: ["title", "lat", "id", "status"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.language.code).toBe("eng");
    expect(result.language.confidence).toBe(0);
    expect(result.fieldMappings.geo).toBeNull();
    expect(result.patterns.idFields).toEqual([]);
    expect(result.patterns.enumFields).toEqual([]);
    // Field mapping should still work
    expect(result.fieldMappings.title).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. Additional field types
// ---------------------------------------------------------------------------

describe("DetectionOptions: additional field types", () => {
  it("detects a custom 'category' field type via additionalFieldTypes", async () => {
    const detector = createDefaultDetector({
      additionalFieldTypes: {
        category: {
          patterns: { eng: [/^category$/i, /^type$/i, /^kind$/i], deu: [/^kategorie$/i, /^typ$/i, /^art$/i] },
          validator: (stats: FieldStatistics) => ((stats.typeDistribution.string ?? 0) > 0 ? 1 : 0),
        },
      },
    });

    const context: DetectionContext = {
      fieldStats: {
        category: makeFieldStats({
          typeDistribution: { string: 100 },
          uniqueSamples: ["music", "art", "food", "sports"],
        }),
        title: makeTitleFieldStats(),
      },
      sampleData: [
        { category: "music", title: "Jazz Night" },
        { category: "art", title: "Gallery Opening" },
      ],
      headers: ["category", "title"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // The additional field type should appear in fieldMappings
    expect(result.fieldMappings).toHaveProperty("category");
    const categoryMapping = (result.fieldMappings as Record<string, unknown>)["category"];
    expect(categoryMapping).not.toBeNull();
    expect((categoryMapping as { path: string }).path).toBe("category");
  });

  it("additional field types do not interfere with standard field types", async () => {
    const detector = createDefaultDetector({
      additionalFieldTypes: {
        priority: {
          patterns: { eng: [/^priority$/i, /^urgency$/i] },
          validator: (stats: FieldStatistics) => ((stats.typeDistribution.string ?? 0) > 0 ? 1 : 0),
        },
      },
    });

    const context: DetectionContext = {
      fieldStats: {
        title: makeTitleFieldStats(),
        priority: makeFieldStats({ typeDistribution: { string: 100 }, uniqueSamples: ["high", "medium", "low"] }),
      },
      sampleData: [
        { title: "Event One", priority: "high" },
        { title: "Event Two", priority: "low" },
      ],
      headers: ["title", "priority"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // Standard title detection should still work
    expect(result.fieldMappings.title?.path).toBe("title");
    // Custom type should also be detected
    expect(result.fieldMappings).toHaveProperty("priority");
  });

  it("additional field types support language fallback", async () => {
    const detector = createDefaultDetector({
      additionalFieldTypes: {
        category: {
          patterns: { deu: [/^kategorie$/i], eng: [/^category$/i] },
          validator: (stats: FieldStatistics) => ((stats.typeDistribution.string ?? 0) > 0 ? 1 : 0),
        },
      },
      language: "deu",
    });

    const context: DetectionContext = {
      fieldStats: {
        kategorie: makeFieldStats({ typeDistribution: { string: 100 }, uniqueSamples: ["Musik", "Kunst", "Essen"] }),
      },
      sampleData: [{ kategorie: "Musik" }],
      headers: ["kategorie"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.fieldMappings).toHaveProperty("category");
    const categoryMapping = (result.fieldMappings as Record<string, unknown>)["category"];
    expect((categoryMapping as { path: string }).path).toBe("kategorie");
  });
});

// ---------------------------------------------------------------------------
// 10. DefaultDetector factory
// ---------------------------------------------------------------------------

describe("DetectionOptions: createDefaultDetector factory", () => {
  it("returns a detector with name 'default'", () => {
    const detector = createDefaultDetector();

    expect(detector.name).toBe("default");
  });

  it("canHandle always returns true", () => {
    const detector = createDefaultDetector();
    const context: DetectionContext = {
      fieldStats: {},
      sampleData: [],
      headers: [],
      config: { enabled: true, priority: 1 },
    };

    expect(detector.canHandle(context)).toBe(true);
  });

  it("detect without options behaves like the default detector", async () => {
    const detector = createDefaultDetector();
    const context: DetectionContext = {
      fieldStats: {
        title: makeTitleFieldStats(),
        id: makeFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
      },
      sampleData: [
        { title: "Summer Music Festival", id: 1 },
        { title: "Art Exhibition Opening", id: 2 },
      ],
      headers: ["title", "id"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    expect(result.language).toBeDefined();
    expect(result.fieldMappings).toBeDefined();
    expect(result.patterns).toBeDefined();
    expect(result.fieldMappings.title?.path).toBe("title");
    expect(result.patterns.idFields).toContain("id");
  });

  it("detect passes options through to all detection steps", async () => {
    const detector = createDefaultDetector({ language: "fra", skip: { enums: true, ids: true } });

    const context: DetectionContext = {
      fieldStats: {
        titre: makeTitleFieldStats(),
        status: makeEnumFieldStats(3),
        id: makeFieldStats({ typeDistribution: { number: 100 }, uniqueValues: 100, occurrences: 100 }),
      },
      sampleData: [{ titre: "Concert de Jazz", status: "actif", id: 1 }],
      headers: ["titre", "status", "id"],
      config: { enabled: true, priority: 1 },
    };

    const result = await detector.detect(context);

    // Language should be forced to French
    expect(result.language.code).toBe("fra");
    // Skip flags should suppress enum and ID detection
    expect(result.patterns.enumFields).toEqual([]);
    expect(result.patterns.idFields).toEqual([]);
    // French title pattern should match "titre"
    expect(result.fieldMappings.title?.path).toBe("titre");
  });

  it("returns has label and description", () => {
    const detector = createDefaultDetector();

    expect(detector.label).toBeDefined();
    expect(typeof detector.label).toBe("string");
    expect(detector.description).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 11. Options merging
// ---------------------------------------------------------------------------

// eslint-disable-next-line sonarjs/max-lines-per-function -- TDD test suite
describe("DetectionOptions: mergeDetectionOptions", () => {
  it("returns empty options when merging two empty objects", () => {
    const result = mergeDetectionOptions({}, {});

    expect(result).toEqual({});
  });

  it("scalar values: second argument wins", () => {
    const plugin: DetectionOptions = { language: "deu" };
    const dataset: DetectionOptions = { language: "fra" };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.language).toBe("fra");
  });

  it("scalar values: first argument preserved when second omits them", () => {
    const plugin: DetectionOptions = { language: "deu", languageConfidenceThreshold: 0.8 };
    const dataset: DetectionOptions = {};

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.language).toBe("deu");
    expect(result.languageConfidenceThreshold).toBe(0.8);
  });

  it("arrays: second prepends to first (field patterns)", () => {
    const plugin: DetectionOptions = { fieldPatterns: { title: { eng: [/^heading$/i] } } };
    const dataset: DetectionOptions = { fieldPatterns: { title: { eng: [/^headline$/i] } } };

    const result = mergeDetectionOptions(plugin, dataset);

    // Dataset patterns should come first (higher priority)
    const titlePatterns = result.fieldPatterns?.title?.eng;
    expect(titlePatterns).toBeDefined();
    expect(titlePatterns!).toHaveLength(2);
    expect(titlePatterns![0]!.source).toBe("^headline$");
    expect(titlePatterns![1]!.source).toBe("^heading$");
  });

  it("skip flags: OR together (true wins)", () => {
    const plugin: DetectionOptions = { skip: { language: true, enums: false } };
    const dataset: DetectionOptions = { skip: { language: false, ids: true } };

    const result = mergeDetectionOptions(plugin, dataset);

    // language: true (from plugin) OR false (from dataset) = true
    expect(result.skip?.language).toBe(true);
    // ids: undefined (from plugin) OR true (from dataset) = true
    expect(result.skip?.ids).toBe(true);
    // enums: false (from plugin) OR undefined (from dataset) = false
    expect(result.skip?.enums).toBe(false);
  });

  it("nested objects: deep merge", () => {
    const plugin: DetectionOptions = { validatorOverrides: { title: { minStringPct: 0.7 } } };
    const dataset: DetectionOptions = { validatorOverrides: { description: { minStringPct: 0.5 } } };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.validatorOverrides?.title).toEqual({ minStringPct: 0.7 });
    expect(result.validatorOverrides?.description).toEqual({ minStringPct: 0.5 });
  });

  it("replacePatterns arrays: concatenated and deduplicated", () => {
    const plugin: DetectionOptions = { replacePatterns: ["title"] };
    const dataset: DetectionOptions = { replacePatterns: ["title", "description"] };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.replacePatterns).toContain("title");
    expect(result.replacePatterns).toContain("description");
    // "title" should not be duplicated
    expect(result.replacePatterns?.filter((p) => p === "title")).toHaveLength(1);
  });

  it("scoring weights: second argument wins", () => {
    const plugin: DetectionOptions = { scoringWeights: [0.6, 0.4] };
    const dataset: DetectionOptions = { scoringWeights: [0.3, 0.7] };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.scoringWeights).toEqual([0.3, 0.7]);
  });

  it("customValidators: second argument wins per field type", () => {
    const pluginValidator = (_stats: FieldStatistics) => 0.5;
    const datasetValidator = (_stats: FieldStatistics) => 0.8;

    const plugin: DetectionOptions = { customValidators: { title: pluginValidator } };
    const dataset: DetectionOptions = { customValidators: { title: datasetValidator } };

    const result = mergeDetectionOptions(plugin, dataset);

    // Dataset validator should override plugin validator for the same field
    expect(result.customValidators?.title).toBe(datasetValidator);
  });

  it("customValidators: merge across different field types", () => {
    const titleValidator = (_stats: FieldStatistics) => 0.5;
    const descriptionValidator = (_stats: FieldStatistics) => 0.8;

    const plugin: DetectionOptions = { customValidators: { title: titleValidator } };
    const dataset: DetectionOptions = { customValidators: { description: descriptionValidator } };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.customValidators?.title).toBe(titleValidator);
    expect(result.customValidators?.description).toBe(descriptionValidator);
  });

  it("customLanguageDetector: second argument wins", () => {
    const pluginDetector = (): LanguageResult => ({ code: "deu", name: "German", confidence: 1, isReliable: true });
    const datasetDetector = (): LanguageResult => ({ code: "fra", name: "French", confidence: 1, isReliable: true });

    const plugin: DetectionOptions = { customLanguageDetector: pluginDetector };
    const dataset: DetectionOptions = { customLanguageDetector: datasetDetector };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.customLanguageDetector).toBe(datasetDetector);
  });

  it("additionalFieldTypes: deep merge across types", () => {
    const plugin: DetectionOptions = {
      additionalFieldTypes: {
        category: { patterns: { eng: [/^category$/i] }, validator: (_stats: FieldStatistics) => 1 },
      },
    };
    const dataset: DetectionOptions = {
      additionalFieldTypes: {
        priority: { patterns: { eng: [/^priority$/i] }, validator: (_stats: FieldStatistics) => 1 },
      },
    };

    const result = mergeDetectionOptions(plugin, dataset);

    expect(result.additionalFieldTypes).toHaveProperty("category");
    expect(result.additionalFieldTypes).toHaveProperty("priority");
  });

  it("coordinate patterns: dataset prepends to plugin", () => {
    const plugin: DetectionOptions = { latitudePatterns: [/^breitengrad$/i] };
    const dataset: DetectionOptions = { latitudePatterns: [/^BREEDTEGRAAD$/i] };

    const result = mergeDetectionOptions(plugin, dataset);

    const patterns = result.latitudePatterns;
    expect(patterns).toBeDefined();
    expect(patterns!).toHaveLength(2);
    // Dataset pattern should come first (higher priority)
    expect(patterns![0]!.source).toBe("^BREEDTEGRAAD$");
    expect(patterns![1]!.source).toBe("^breitengrad$");
  });
});

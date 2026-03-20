/**
 * Unit tests for field mapping step pure logic.
 *
 * Tests preview transforms, column view building, target assignment,
 * chip labels, and completion status.
 *
 * @module
 * @category Tests
 */

// ---------------------------------------------------------------------------
// Mocks — must come before source imports
// ---------------------------------------------------------------------------

// Mock next-intl (used by all three source files)
vi.mock("next-intl", () => ({ useTranslations: vi.fn(() => (key: string) => key) }));

// Mock React (hooks used by source files)
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object) };
});

// Mock @/i18n/navigation (used by step-field-mapping.tsx)
vi.mock("@/i18n/navigation", () => ({ useRouter: vi.fn(() => ({ push: vi.fn() })) }));

// Mock local component imports from step-field-mapping.tsx
vi.mock("@/app/[locale]/(frontend)/import/_components/use-wizard-effects", () => ({
  useWizardCanProceed: vi.fn(() => false),
}));
vi.mock("@/app/[locale]/(frontend)/import/_components/wizard-store", () => ({ useWizardStore: vi.fn(() => null) }));
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/column-mapping-table", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object) };
});
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/field-mapping-sections", () => ({
  CompletionStatusBar: vi.fn(),
  ConfigSuggestionBanner: vi.fn(),
  DataPreviewSection: vi.fn(),
  LanguageDetectionBanner: vi.fn(),
}));
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/id-strategy-card", () => ({ IdStrategyCard: vi.fn() }));
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/sheet-tab-button", () => ({ SheetTabButton: vi.fn() }));

// Mock local component imports from column-mapping-table.tsx
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/column-mapping-shared", () => ({
  TargetSelect: vi.fn(),
  TRANSFORM_COLORS: {},
  TRANSFORM_ICONS: {},
}));
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/column-row", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object) };
});

// Mock local component imports from column-row.tsx
vi.mock("@/app/[locale]/(frontend)/import/_components/transforms/transform-editor", () => ({
  TransformEditor: vi.fn(),
}));
vi.mock("@/app/[locale]/(frontend)/import/_components/steps/field-select", () => ({ ConfidenceBadge: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { describe, expect, it, vi } from "vitest";

import {
  buildColumnView,
  findTargetForColumn,
  getSampleValue,
} from "@/app/[locale]/(frontend)/import/_components/steps/column-mapping-table";
import { getTransformChipLabel } from "@/app/[locale]/(frontend)/import/_components/steps/column-row";
import { applyPreviewTransforms } from "@/app/[locale]/(frontend)/import/_components/steps/step-field-mapping";
import type { ImportTransform } from "@/lib/types/import-transforms";
import type { FieldMapping, SuggestedMappings } from "@/lib/types/import-wizard";
import { isFieldMappingComplete } from "@/lib/types/import-wizard";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal FieldMapping with defaults. */
const createFieldMapping = (overrides: Partial<FieldMapping> = {}): FieldMapping => ({
  sheetIndex: 0,
  titleField: null,
  descriptionField: null,
  locationNameField: null,
  dateField: null,
  idField: null,
  idStrategy: "auto",
  locationField: null,
  latitudeField: null,
  longitudeField: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// A. Preview Transforms
// ---------------------------------------------------------------------------

describe("applyPreviewTransforms", () => {
  it("should return original data when no transforms", () => {
    const data = [{ name: "Berlin", count: "42" }];
    expect(applyPreviewTransforms(data, [])).toEqual(data);
  });

  it("should apply uppercase transform", () => {
    const data = [{ city: "berlin" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.city).toBe("BERLIN");
  });

  it("should apply lowercase transform", () => {
    const data = [{ city: "BERLIN" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "lowercase", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.city).toBe("berlin");
  });

  it("should apply replace transform", () => {
    const data = [{ text: "hello world" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "text",
        operation: "replace",
        pattern: "world",
        replacement: "earth",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.text).toBe("hello earth");
  });

  it("should apply replace with empty replacement when replacement is undefined", () => {
    const data = [{ text: "hello world" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "text",
        operation: "replace",
        pattern: "world",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.text).toBe("hello ");
  });

  it("should apply rename transform", () => {
    const data = [{ old_name: "value" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "old_name", to: "new_name", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.new_name).toBe("value");
    expect(result[0]!.old_name).toBeUndefined();
  });

  it("should apply concatenate transform", () => {
    const data = [{ first: "John", last: "Doe" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: " ",
        to: "full_name",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.full_name).toBe("John Doe");
  });

  it("should apply concatenate transform with custom separator", () => {
    const data = [{ first: "John", last: "Doe" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: ", ",
        to: "full_name",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.full_name).toBe("John, Doe");
  });

  it("should skip null values in concatenate", () => {
    const data = [{ first: "John", middle: null, last: "Doe" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "middle", "last"],
        separator: " ",
        to: "full_name",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.full_name).toBe("John Doe");
  });

  it("should apply split transform", () => {
    const data = [{ coords: "52.5,13.4" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lon"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.lat).toBe("52.5");
    expect(result[0]!.lon).toBe("13.4");
  });

  it("should trim split values", () => {
    const data = [{ coords: "52.5 , 13.4" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lon"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.lat).toBe("52.5");
    expect(result[0]!.lon).toBe("13.4");
  });

  it("should handle split with fewer parts than toFields", () => {
    const data = [{ value: "only_one" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "value",
        delimiter: ",",
        toFields: ["a", "b", "c"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.a).toBe("only_one");
    expect(result[0]!.b).toBeUndefined();
    expect(result[0]!.c).toBeUndefined();
  });

  it("should skip inactive transforms", () => {
    const data = [{ city: "berlin" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "uppercase", active: false, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.city).toBe("berlin");
  });

  it("should chain multiple transforms", () => {
    const data = [{ name: "  John Doe  " }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "name", operation: "uppercase", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "name", to: "full_name", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.full_name).toBe("  JOHN DOE  ");
    expect(result[0]!.name).toBeUndefined();
  });

  it("should handle multiple rows", () => {
    const data = [{ city: "berlin" }, { city: "paris" }, { city: "london" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result.map((r) => r.city)).toEqual(["BERLIN", "PARIS", "LONDON"]);
  });

  it("should not mutate original data", () => {
    const data = [{ city: "berlin" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "uppercase", active: true, autoDetected: false },
    ];
    applyPreviewTransforms(data, transforms);
    expect(data[0]!.city).toBe("berlin");
  });

  it("should skip string-op on non-string values", () => {
    const data = [{ count: 42 }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "count", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.count).toBe(42);
  });

  it("should handle expression as no-op in preview", () => {
    const data = [{ price: "42.5" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "price",
        operation: "expression",
        expression: "toNumber(value)",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    // Expression is not handled in the preview (only uppercase, lowercase, replace)
    expect(result[0]!.price).toBe("42.5");
  });

  it("should skip split on non-string values", () => {
    const data = [{ count: 42 }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "count",
        delimiter: ",",
        toFields: ["a", "b"],
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.count).toBe(42);
    expect(result[0]!.a).toBeUndefined();
  });

  it("should not rename when source field is undefined", () => {
    const data = [{ other: "value" }];
    const transforms: ImportTransform[] = [
      { id: "1", type: "rename", from: "missing", to: "new_name", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.new_name).toBeUndefined();
    expect(result[0]!.other).toBe("value");
  });

  it("should handle empty data array", () => {
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "city", operation: "uppercase", active: true, autoDetected: false },
    ];
    const result = applyPreviewTransforms([], transforms);
    expect(result).toEqual([]);
  });

  it("should replace all occurrences with replaceAll", () => {
    const data = [{ text: "foo-bar-baz" }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "string-op",
        from: "text",
        operation: "replace",
        pattern: "-",
        replacement: " ",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.text).toBe("foo bar baz");
  });

  it("should not produce concatenation when all fromFields are null", () => {
    const data = [{ a: null, b: null }];
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["a", "b"],
        separator: " ",
        to: "combined",
        active: true,
        autoDetected: false,
      },
    ];
    const result = applyPreviewTransforms(data, transforms);
    expect(result[0]!.combined).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// B. Column View Building
// ---------------------------------------------------------------------------

describe("buildColumnView", () => {
  it("should build rows from headers", () => {
    const headers = ["name", "date", "location"];
    const sampleData = [{ name: "Test Event", date: "2024-01-01", location: "Berlin" }];
    const fieldMapping = createFieldMapping();

    const rows = buildColumnView(headers, sampleData, fieldMapping, []);

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.columnName)).toEqual(["name", "date", "location"]);
  });

  it("should find target field for mapped column", () => {
    const headers = ["name", "date"];
    const sampleData = [{ name: "Event", date: "2024-01-01" }];
    const fieldMapping = createFieldMapping({ titleField: "name", dateField: "date" });

    const rows = buildColumnView(headers, sampleData, fieldMapping, []);

    expect(rows[0]!.targetField).toBe("titleField");
    expect(rows[1]!.targetField).toBe("dateField");
  });

  it("should detect auto-detected fields from suggestions", () => {
    const headers = ["title"];
    const sampleData = [{ title: "Event" }];
    const fieldMapping = createFieldMapping({ titleField: "title" });
    const suggestedMappings: SuggestedMappings = {
      language: { code: "eng", name: "English", confidence: 0.9, isReliable: true },
      mappings: {
        titlePath: { path: "title", confidence: 90, confidenceLevel: "high" },
        descriptionPath: { path: null, confidence: 0, confidenceLevel: "none" },
        locationNamePath: { path: null, confidence: 0, confidenceLevel: "none" },
        timestampPath: { path: null, confidence: 0, confidenceLevel: "none" },
        latitudePath: { path: null, confidence: 0, confidenceLevel: "none" },
        longitudePath: { path: null, confidence: 0, confidenceLevel: "none" },
        locationPath: { path: null, confidence: 0, confidenceLevel: "none" },
      },
    };

    const rows = buildColumnView(headers, sampleData, fieldMapping, [], suggestedMappings);

    expect(rows[0]!.isAutoDetected).toBe(true);
    expect(rows[0]!.confidenceLevel).toBe("high");
  });

  it("should detect split parent columns", () => {
    const headers = ["coords"];
    const sampleData = [{ coords: "52.5,13.4" }];
    const fieldMapping = createFieldMapping();
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lon"],
        active: true,
        autoDetected: false,
      },
    ];

    const rows = buildColumnView(headers, sampleData, fieldMapping, transforms);

    expect(rows[0]!.isSplitParent).toBe(true);
    expect(rows[0]!.splitChildren).toEqual(["lat", "lon"]);
  });

  it("should compute split child transforms", () => {
    const headers = ["coords"];
    const sampleData = [{ coords: "52.5,13.4" }];
    const fieldMapping = createFieldMapping();
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lon"],
        active: true,
        autoDetected: false,
      },
      { id: "2", type: "string-op", from: "lat", operation: "uppercase", active: true, autoDetected: false },
    ];

    const rows = buildColumnView(headers, sampleData, fieldMapping, transforms);

    expect(rows[0]!.splitChildTransforms).toBeDefined();
    expect(rows[0]!.splitChildTransforms!["lat"]).toHaveLength(1);
    expect(rows[0]!.splitChildTransforms!["lat"]![0]!.id).toBe("2");
    expect(rows[0]!.splitChildTransforms!["lon"]).toHaveLength(0);
  });

  it("should compute split child targets", () => {
    const headers = ["coords"];
    const sampleData = [{ coords: "52.5,13.4" }];
    const fieldMapping = createFieldMapping({ latitudeField: "lat", longitudeField: "lon" });
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "split",
        from: "coords",
        delimiter: ",",
        toFields: ["lat", "lon"],
        active: true,
        autoDetected: false,
      },
    ];

    const rows = buildColumnView(headers, sampleData, fieldMapping, transforms);

    expect(rows[0]!.splitChildTargets).toBeDefined();
    expect(rows[0]!.splitChildTargets!["lat"]).toBe("latitudeField");
    expect(rows[0]!.splitChildTargets!["lon"]).toBe("longitudeField");
  });

  it("should return null target for unmapped columns", () => {
    const headers = ["extra_column"];
    const sampleData = [{ extra_column: "value" }];
    const fieldMapping = createFieldMapping();

    const rows = buildColumnView(headers, sampleData, fieldMapping, []);

    expect(rows[0]!.targetField).toBeNull();
  });

  it("should not be auto-detected when no suggestions provided", () => {
    const headers = ["name"];
    const sampleData = [{ name: "Event" }];
    const fieldMapping = createFieldMapping({ titleField: "name" });

    const rows = buildColumnView(headers, sampleData, fieldMapping, []);

    expect(rows[0]!.isAutoDetected).toBe(false);
    expect(rows[0]!.confidenceLevel).toBe("none");
  });

  it("should associate column transforms correctly", () => {
    const headers = ["name", "date"];
    const sampleData = [{ name: "event", date: "2024-01-01" }];
    const fieldMapping = createFieldMapping();
    const transforms: ImportTransform[] = [
      { id: "1", type: "string-op", from: "name", operation: "uppercase", active: true, autoDetected: false },
      { id: "2", type: "rename", from: "date", to: "event_date", active: true, autoDetected: false },
    ];

    const rows = buildColumnView(headers, sampleData, fieldMapping, transforms);

    expect(rows[0]!.transforms).toHaveLength(1);
    expect(rows[0]!.transforms[0]!.id).toBe("1");
    expect(rows[1]!.transforms).toHaveLength(1);
    expect(rows[1]!.transforms[0]!.id).toBe("2");
  });

  it("should include concatenate transforms for columns in fromFields", () => {
    const headers = ["first", "last"];
    const sampleData = [{ first: "John", last: "Doe" }];
    const fieldMapping = createFieldMapping();
    const transforms: ImportTransform[] = [
      {
        id: "1",
        type: "concatenate",
        fromFields: ["first", "last"],
        separator: " ",
        to: "full_name",
        active: true,
        autoDetected: false,
      },
    ];

    const rows = buildColumnView(headers, sampleData, fieldMapping, transforms);

    // Both columns should reference the concatenate transform
    expect(rows[0]!.transforms).toHaveLength(1);
    expect(rows[0]!.transforms[0]!.type).toBe("concatenate");
    expect(rows[1]!.transforms).toHaveLength(1);
    expect(rows[1]!.transforms[0]!.type).toBe("concatenate");
  });
});

// ---------------------------------------------------------------------------
// C. Target Field Assignment
// ---------------------------------------------------------------------------

describe("findTargetForColumn", () => {
  it("should find titleField target", () => {
    const mapping = createFieldMapping({ titleField: "name" });
    expect(findTargetForColumn("name", mapping)).toBe("titleField");
  });

  it("should find dateField target", () => {
    const mapping = createFieldMapping({ dateField: "event_date" });
    expect(findTargetForColumn("event_date", mapping)).toBe("dateField");
  });

  it("should find locationField target", () => {
    const mapping = createFieldMapping({ locationField: "address" });
    expect(findTargetForColumn("address", mapping)).toBe("locationField");
  });

  it("should find descriptionField target", () => {
    const mapping = createFieldMapping({ descriptionField: "desc" });
    expect(findTargetForColumn("desc", mapping)).toBe("descriptionField");
  });

  it("should find latitudeField target", () => {
    const mapping = createFieldMapping({ latitudeField: "lat" });
    expect(findTargetForColumn("lat", mapping)).toBe("latitudeField");
  });

  it("should find longitudeField target", () => {
    const mapping = createFieldMapping({ longitudeField: "lng" });
    expect(findTargetForColumn("lng", mapping)).toBe("longitudeField");
  });

  it("should find locationNameField target", () => {
    const mapping = createFieldMapping({ locationNameField: "venue" });
    expect(findTargetForColumn("venue", mapping)).toBe("locationNameField");
  });

  it("should find idField target", () => {
    const mapping = createFieldMapping({ idField: "external_id" });
    expect(findTargetForColumn("external_id", mapping)).toBe("idField");
  });

  it("should return null for unmapped column", () => {
    const mapping = createFieldMapping({ titleField: "name" });
    expect(findTargetForColumn("unknown_column", mapping)).toBeNull();
  });

  it("should return null for column mapped to a different field", () => {
    const mapping = createFieldMapping({ titleField: "name" });
    expect(findTargetForColumn("date", mapping)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. Transform Chip Labels
// ---------------------------------------------------------------------------

describe("getTransformChipLabel", () => {
  const mockT = (key: string, params?: Record<string, unknown>): string => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  };

  it("should show rename with target name", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "rename",
      from: "old",
      to: "new_field",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe('tfChipRename:{"name":"new_field"}');
  });

  it("should show rename default when no target", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "rename",
      from: "old",
      to: "",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe("tfChipRenameDefault");
  });

  it("should show date format", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "date-parse",
      from: "date",
      inputFormat: "DD/MM/YYYY",
      outputFormat: "YYYY-MM-DD",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe('tfChipDate:{"format":"DD/MM/YYYY"}');
  });

  it("should show date default when no format", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "date-parse",
      from: "date",
      inputFormat: "",
      outputFormat: "YYYY-MM-DD",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe("tfChipDateDefault");
  });

  it("should capitalize string-op operation name", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "string-op",
      from: "field",
      operation: "uppercase",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe("Uppercase");
  });

  it("should capitalize lowercase operation name", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "string-op",
      from: "field",
      operation: "lowercase",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe("Lowercase");
  });

  it("should capitalize replace operation name", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "string-op",
      from: "field",
      operation: "replace",
      pattern: "a",
      replacement: "b",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe("Replace");
  });

  it("should show join field count", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "concatenate",
      fromFields: ["a", "b", "c"],
      separator: " ",
      to: "combined",
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe('tfChipJoin:{"count":3}');
  });

  it("should show split count", () => {
    const transform: ImportTransform = {
      id: "1",
      type: "split",
      from: "coords",
      delimiter: ",",
      toFields: ["lat", "lon"],
      active: true,
      autoDetected: false,
    };
    const label = getTransformChipLabel(transform, mockT);
    expect(label).toBe('tfChipSplit:{"count":2}');
  });
});

// ---------------------------------------------------------------------------
// E. Completion Status
// ---------------------------------------------------------------------------

describe("isFieldMappingComplete", () => {
  it("should be incomplete with no fields", () => {
    expect(isFieldMappingComplete(createFieldMapping())).toBe(false);
  });

  it("should be incomplete with only title", () => {
    expect(isFieldMappingComplete(createFieldMapping({ titleField: "name" }))).toBe(false);
  });

  it("should be incomplete with title + date but no location", () => {
    expect(isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "date" }))).toBe(false);
  });

  it("should be complete with title + date + locationField", () => {
    expect(
      isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "date", locationField: "address" }))
    ).toBe(true);
  });

  it("should be complete with title + date + lat + lon", () => {
    expect(
      isFieldMappingComplete(
        createFieldMapping({ titleField: "name", dateField: "date", latitudeField: "lat", longitudeField: "lon" })
      )
    ).toBe(true);
  });

  it("should be incomplete with only lat (missing lon)", () => {
    expect(
      isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "date", latitudeField: "lat" }))
    ).toBe(false);
  });

  it("should be incomplete with only lon (missing lat)", () => {
    expect(
      isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "date", longitudeField: "lon" }))
    ).toBe(false);
  });

  it("should return false for undefined mapping", () => {
    expect(isFieldMappingComplete(undefined)).toBe(false);
  });

  it("should be complete with all location strategies combined", () => {
    expect(
      isFieldMappingComplete(
        createFieldMapping({
          titleField: "name",
          dateField: "date",
          locationField: "address",
          latitudeField: "lat",
          longitudeField: "lon",
        })
      )
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. getSampleValue
// ---------------------------------------------------------------------------

describe("getSampleValue", () => {
  it("should return first non-null value", () => {
    const sampleData = [{ name: "Berlin" }, { name: "Paris" }];
    expect(getSampleValue("name", sampleData)).toBe("Berlin");
  });

  it("should skip null and undefined values", () => {
    const sampleData = [{ name: null }, { name: undefined }, { name: "Berlin" }];
    expect(getSampleValue("name", sampleData)).toBe("Berlin");
  });

  it("should skip empty string values", () => {
    const sampleData = [{ name: "" }, { name: "Berlin" }];
    expect(getSampleValue("name", sampleData)).toBe("Berlin");
  });

  it("should return first row value if all null", () => {
    const sampleData = [{ name: null }, { name: null }];
    expect(getSampleValue("name", sampleData)).toBeNull();
  });

  it("should return null for empty sample data", () => {
    expect(getSampleValue("name", [])).toBeNull();
  });

  it("should return numeric values", () => {
    const sampleData = [{ count: 42 }];
    expect(getSampleValue("count", sampleData)).toBe(42);
  });

  it("should return zero as valid value", () => {
    const sampleData = [{ count: 0 }];
    // 0 is not null/undefined/empty-string, so it should be returned
    expect(getSampleValue("count", sampleData)).toBe(0);
  });

  it("should return null for missing column", () => {
    const sampleData = [{ other: "value" }];
    expect(getSampleValue("name", sampleData)).toBeNull();
  });

  it("should return false as valid value", () => {
    const sampleData = [{ active: false }];
    expect(getSampleValue("active", sampleData)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// G. Edge Cases — probing for bugs
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  describe("isFieldMappingComplete with empty strings", () => {
    it("should treat empty string titleField as incomplete", () => {
      // Empty string is not a valid column selection
      expect(
        isFieldMappingComplete(createFieldMapping({ titleField: "", dateField: "date", locationField: "loc" }))
      ).toBe(false);
    });

    it("should treat empty string dateField as incomplete", () => {
      expect(
        isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "", locationField: "loc" }))
      ).toBe(false);
    });

    it("should treat empty string locationField as incomplete", () => {
      expect(
        isFieldMappingComplete(createFieldMapping({ titleField: "name", dateField: "date", locationField: "" }))
      ).toBe(false);
    });
  });

  describe("findTargetForColumn with empty strings", () => {
    it("should not match empty string column to empty string field", () => {
      // If a field is accidentally set to "", looking up "" should not match
      const mapping = createFieldMapping({ titleField: "" });
      expect(findTargetForColumn("", mapping)).toBeNull();
    });
  });

  describe("buildColumnView with duplicate headers", () => {
    it("should handle duplicate column names", () => {
      const headers = ["name", "name"];
      const sampleData = [{ name: "Berlin" }];
      const fieldMapping = createFieldMapping({ titleField: "name" });
      const rows = buildColumnView(headers, sampleData, fieldMapping, []);
      // Both rows get the same target — this is a data quality issue, not a crash
      expect(rows).toHaveLength(2);
      expect(rows[0]!.targetField).toBe("titleField");
      expect(rows[1]!.targetField).toBe("titleField");
    });
  });

  describe("applyPreviewTransforms edge cases", () => {
    it("should handle replace with undefined pattern gracefully", () => {
      const data = [{ text: "hello" }];
      const transforms: ImportTransform[] = [
        {
          id: "1",
          type: "string-op",
          from: "text",
          operation: "replace",
          // pattern is undefined — should skip replace
          active: true,
          autoDetected: false,
        },
      ];
      const result = applyPreviewTransforms(data, transforms);
      expect(result[0]!.text).toBe("hello");
    });

    it("should handle concatenate with single field", () => {
      const data = [{ name: "Berlin" }];
      const transforms: ImportTransform[] = [
        {
          id: "1",
          type: "concatenate",
          fromFields: ["name"],
          separator: ",",
          to: "combined",
          active: true,
          autoDetected: false,
        },
      ];
      const result = applyPreviewTransforms(data, transforms);
      expect(result[0]!.combined).toBe("Berlin");
    });

    it("should handle split with empty delimiter", () => {
      const data = [{ text: "abc" }];
      const transforms: ImportTransform[] = [
        {
          id: "1",
          type: "split",
          from: "text",
          delimiter: "",
          toFields: ["a", "b", "c"],
          active: true,
          autoDetected: false,
        },
      ];
      const result = applyPreviewTransforms(data, transforms);
      // Empty delimiter splits every character
      expect(result[0]!.a).toBe("a");
      expect(result[0]!.b).toBe("b");
      expect(result[0]!.c).toBe("c");
    });

    it("should handle rename overwriting existing field", () => {
      const data = [{ old: "old_value", new_name: "existing_value" }];
      const transforms: ImportTransform[] = [
        { id: "1", type: "rename", from: "old", to: "new_name", active: true, autoDetected: false },
      ];
      const result = applyPreviewTransforms(data, transforms);
      // Rename should overwrite the existing field
      expect(result[0]!.new_name).toBe("old_value");
      expect(result[0]!.old).toBeUndefined();
    });
  });
});

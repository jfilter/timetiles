/**
 * Unit tests for field mapping step pure logic.
 *
 * Tests preview transforms, column view building, target assignment,
 * chip labels, and completion status.
 *
 * @module
 * @category Tests
 */

import { describe, expect, it, vi } from "vitest";

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
vi.mock("@/app/[locale]/(frontend)/ingest/_components/use-wizard-effects", () => ({
  useWizardCanProceed: vi.fn(() => false),
}));
vi.mock("@/app/[locale]/(frontend)/ingest/_components/wizard-store", () => ({ useWizardStore: vi.fn(() => null) }));
// column-mapping-table: mock the component, re-export pure functions via dynamic import
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/column-mapping-table", async () => {
  // Dynamic import bypasses Vite's static JSX analysis
  const mod = await vi.importActual<Record<string, unknown>>(
    "@/app/[locale]/(frontend)/ingest/_components/steps/column-mapping-table"
  );
  return { ...mod, ColumnMappingTable: vi.fn() };
});
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/field-mapping-sections", () => ({
  CompletionStatusBar: vi.fn(),
  ConfigSuggestionBanner: vi.fn(),
  DataPreviewSection: vi.fn(),
  LanguageDetectionBanner: vi.fn(),
}));
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/id-strategy-card", () => ({ IdStrategyCard: vi.fn() }));
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/sheet-tab-button", () => ({ SheetTabButton: vi.fn() }));

// Mock local component imports from column-mapping-table.tsx
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/column-mapping-shared", () => ({
  TargetSelect: vi.fn(),
  TRANSFORM_COLORS: {},
  TRANSFORM_ICONS: {},
}));
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/column-row", async () => {
  const mod = await vi.importActual<Record<string, unknown>>(
    "@/app/[locale]/(frontend)/ingest/_components/steps/column-row"
  );
  return { ...mod, ColumnRow: vi.fn() };
});

// Mock local component imports from column-row.tsx
vi.mock("@/app/[locale]/(frontend)/ingest/_components/transforms/transform-editor", () => ({
  TransformEditor: vi.fn(),
}));
vi.mock("@/app/[locale]/(frontend)/ingest/_components/steps/field-select", () => ({ ConfidenceBadge: vi.fn() }));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { getTransformChipLabel } from "@/app/[locale]/(frontend)/ingest/_components/steps/column-row";
import { buildColumnView, findTargetForColumn, getSampleValue } from "@/lib/ingest/column-view";
import { applyPreviewTransforms } from "@/lib/ingest/transforms";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping, SuggestedMappings } from "@/lib/ingest/types/wizard";
import { isFieldMappingComplete } from "@/lib/ingest/types/wizard";

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
  endDateField: null,
  idField: null,
  idStrategy: "content-hash",
  locationField: null,
  latitudeField: null,
  longitudeField: null,
  coordinateField: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// A. Preview Transforms
// ---------------------------------------------------------------------------

describe("applyPreviewTransforms", () => {
  const uppercase = (from: string, active: boolean, id = "1"): IngestTransform => ({
    id,
    type: "string-op",
    from,
    operation: "uppercase",
    active,
    autoDetected: false,
  });

  it("returns the same array when there are no transforms", () => {
    const data = [{ city: "berlin" }];
    expect(applyPreviewTransforms(data, [])).toBe(data);
  });

  it("returns the same array when every transform is inactive", () => {
    const data = [{ city: "berlin" }];
    expect(applyPreviewTransforms(data, [uppercase("city", false)])).toBe(data);
  });

  it("applies only the active transforms", () => {
    const data = [{ city: "berlin", country: "germany" }];
    const result = applyPreviewTransforms(data, [uppercase("city", true), uppercase("country", false, "2")]);
    expect(result).toEqual([{ city: "BERLIN", country: "germany" }]);
  });

  it("skips incomplete transforms exactly like the import does", () => {
    const data = [{ coords: "52.5,13.4" }];
    const split: IngestTransform = {
      id: "1",
      type: "split",
      from: "coords",
      delimiter: "",
      toFields: ["lat", "lng"],
      active: true,
      autoDetected: false,
    };
    expect(applyPreviewTransforms(data, [split])).toBe(data);
  });

  it("transforms every row without mutating the input", () => {
    const data = [{ city: "berlin" }, { city: "paris" }, { city: "london" }];
    const result = applyPreviewTransforms(data, [uppercase("city", true)]);
    expect(result.map((r) => r.city)).toEqual(["BERLIN", "PARIS", "LONDON"]);
    expect(data.map((r) => r.city)).toEqual(["berlin", "paris", "london"]);
  });
});

// ---------------------------------------------------------------------------
// B. Column View Building
// ---------------------------------------------------------------------------

describe("buildColumnView", () => {
  it("exposes a generated rename target as an editable mapping row", () => {
    const rows = buildColumnView(["raw"], [{ raw: "Event" }], createFieldMapping({ titleField: "title" }), [
      { id: "rename", type: "rename", from: "raw", to: "title", active: true, autoDetected: false },
    ]);
    expect(rows.find((row) => row.columnName === "title")?.targetField).toBe("titleField");
  });

  it("does not expose outputs from inactive transforms", () => {
    const rows = buildColumnView(["raw"], [], createFieldMapping(), [
      { id: "rename", type: "rename", from: "raw", to: "title", active: false, autoDetected: false },
    ]);
    expect(rows.map((row) => row.columnName)).toEqual(["raw"]);
  });

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
        endTimestampPath: { path: null, confidence: 0, confidenceLevel: "none" },
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
    const transforms: IngestTransform[] = [
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
    const transforms: IngestTransform[] = [
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
    const transforms: IngestTransform[] = [
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
    const transforms: IngestTransform[] = [
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
    const transforms: IngestTransform[] = [
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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
    const transform: IngestTransform = {
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

  it("should be incomplete when the external ID strategy has no ID field", () => {
    expect(
      isFieldMappingComplete(
        createFieldMapping({ titleField: "name", dateField: "date", locationField: "address", idStrategy: "external" })
      )
    ).toBe(false);
  });

  it("should be complete when the external ID strategy has an ID field", () => {
    expect(
      isFieldMappingComplete(
        createFieldMapping({
          titleField: "name",
          dateField: "date",
          locationField: "address",
          idStrategy: "external",
          idField: "id",
        })
      )
    ).toBe(true);
  });

  it("does not require an ID field for non-external strategies", () => {
    expect(
      isFieldMappingComplete(
        createFieldMapping({
          titleField: "name",
          dateField: "date",
          locationField: "address",
          idStrategy: "content-hash",
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
});

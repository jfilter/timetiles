// @vitest-environment node
/**
 * Unit tests for `validateFieldMappingPaths` in the ingest configure service.
 *
 * Covers the M9 fix: field-mapping paths must exist in the preview's
 * detected schema (or be produced by a configured transform). Invalid
 * paths throw a ValidationError listing the offending entries instead
 * of silently persisting to the dataset and failing downstream.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/api/errors";
import { validateFieldMappingPaths } from "@/lib/ingest/configure-service";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { FieldMapping, SheetInfo, SheetMapping } from "@/lib/ingest/types/wizard";

const baseSheet: SheetInfo = {
  index: 0,
  name: "Sheet1",
  rowCount: 3,
  headers: ["title", "date", "lat", "lng"],
  sampleData: [],
};

const baseSheetMapping: SheetMapping = { sheetIndex: 0, datasetId: "new", newDatasetName: "Test" };

const baseFieldMapping: FieldMapping = {
  sheetIndex: 0,
  titleField: "title",
  descriptionField: null,
  locationNameField: null,
  dateField: "date",
  endDateField: null,
  idField: null,
  idStrategy: "content-hash",
  locationField: null,
  latitudeField: "lat",
  longitudeField: "lng",
};

describe("validateFieldMappingPaths", () => {
  it("accepts mappings whose paths all exist in the detected schema", () => {
    expect(() => validateFieldMappingPaths([baseSheet], [baseSheetMapping], [baseFieldMapping])).not.toThrow();
  });

  it("rejects mappings that reference paths missing from the sheet", () => {
    const invalid: FieldMapping = { ...baseFieldMapping, titleField: "does_not_exist" };

    expect(() => validateFieldMappingPaths([baseSheet], [baseSheetMapping], [invalid])).toThrow(ValidationError);

    try {
      validateFieldMappingPaths([baseSheet], [baseSheetMapping], [invalid]);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("does_not_exist");
      expect((err as ValidationError).message).toContain("sheet 0");
      expect((err as ValidationError).message).toContain("titleField");
    }
  });

  it("accepts paths that are produced by a rename transform", () => {
    // User mapped `titleField` to "normalized_title" which is NOT in the raw headers
    // but IS produced by a rename transform. Should be treated as valid.
    const mapping: FieldMapping = { ...baseFieldMapping, titleField: "normalized_title" };
    const transforms: IngestTransform[] = [
      { id: "t1", active: true, autoDetected: false, type: "rename", from: "title", to: "normalized_title" },
    ];

    expect(() =>
      validateFieldMappingPaths([baseSheet], [baseSheetMapping], [mapping], [{ sheetIndex: 0, transforms }])
    ).not.toThrow();
  });

  it("accepts paths produced by a concatenate transform", () => {
    const mapping: FieldMapping = { ...baseFieldMapping, titleField: "combined" };
    const transforms: IngestTransform[] = [
      {
        id: "t1",
        active: true,
        autoDetected: false,
        type: "concatenate",
        fromFields: ["title", "date"],
        separator: " - ",
        to: "combined",
      },
    ];

    expect(() =>
      validateFieldMappingPaths([baseSheet], [baseSheetMapping], [mapping], [{ sheetIndex: 0, transforms }])
    ).not.toThrow();
  });

  it("accepts paths produced by a split transform", () => {
    const mapping: FieldMapping = { ...baseFieldMapping, latitudeField: "lat_split", longitudeField: "lng_split" };
    const transforms: IngestTransform[] = [
      {
        id: "t1",
        active: true,
        autoDetected: false,
        type: "split",
        from: "lat",
        delimiter: ",",
        toFields: ["lat_split", "lng_split"],
      },
    ];

    expect(() =>
      validateFieldMappingPaths([baseSheet], [baseSheetMapping], [mapping], [{ sheetIndex: 0, transforms }])
    ).not.toThrow();
  });

  it("throws when referencing a sheet index that is not in the preview", () => {
    const mapping: FieldMapping = { ...baseFieldMapping, sheetIndex: 5 };
    const sheetMapping: SheetMapping = { ...baseSheetMapping, sheetIndex: 5 };

    expect(() => validateFieldMappingPaths([baseSheet], [sheetMapping], [mapping])).toThrow(/sheet 5.+was not found/);
  });

  it("validates each sheet independently — paths valid in sheet A are not assumed valid in sheet B", () => {
    const sheetA: SheetInfo = { ...baseSheet, index: 0, headers: ["title", "date"] };
    const sheetB: SheetInfo = { ...baseSheet, index: 1, name: "Sheet2", headers: ["headline", "when"] };

    const mappingA: FieldMapping = {
      ...baseFieldMapping,
      sheetIndex: 0,
      titleField: "title",
      dateField: "date",
      latitudeField: null,
      longitudeField: null,
    };
    // In sheet B the user claims `title` and `date` — but those don't exist in sheet B.
    const mappingB: FieldMapping = {
      ...baseFieldMapping,
      sheetIndex: 1,
      titleField: "title",
      dateField: "date",
      latitudeField: null,
      longitudeField: null,
    };
    const sheetMappingA: SheetMapping = { ...baseSheetMapping, sheetIndex: 0 };
    const sheetMappingB: SheetMapping = { ...baseSheetMapping, sheetIndex: 1 };

    expect(() =>
      validateFieldMappingPaths([sheetA, sheetB], [sheetMappingA, sheetMappingB], [mappingA, mappingB])
    ).toThrow(ValidationError);
  });

  it("skips mapping fields that are null or empty", () => {
    const mapping: FieldMapping = {
      ...baseFieldMapping,
      descriptionField: null,
      locationNameField: null,
      endDateField: null,
      idField: null,
      locationField: null,
    };

    expect(() => validateFieldMappingPaths([baseSheet], [baseSheetMapping], [mapping])).not.toThrow();
  });

  it("reports ALL invalid paths across a single call (not just the first)", () => {
    const mapping: FieldMapping = { ...baseFieldMapping, titleField: "bad_title", dateField: "bad_date" };

    try {
      validateFieldMappingPaths([baseSheet], [baseSheetMapping], [mapping]);
      expect.fail("expected ValidationError");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("bad_title");
      expect((err as ValidationError).message).toContain("bad_date");
    }
  });
});

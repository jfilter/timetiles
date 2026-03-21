/**
 * Unit tests for config matcher service.
 *
 * Tests the pure header-matching logic that finds existing dataset configs
 * similar to an uploaded file's column structure.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { findConfigSuggestions } from "@/lib/import/config-matcher";
import type { Dataset } from "@/payload-types";

/** Create a minimal Dataset stub with only the fields config-matcher inspects. */
const makeDataset = (
  overrides: Partial<Dataset> & { id: number; name: string; catalogName?: string; catalogId?: number }
): Dataset & { catalogName?: string; catalogId?: number } => {
  const { catalogName, catalogId, ...rest } = overrides;
  return {
    catalog: 1,
    language: "eng",
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...rest,
    catalogName,
    catalogId: catalogId ?? 1,
  } as Dataset & { catalogName?: string; catalogId?: number };
};

describe("findConfigSuggestions", () => {
  it("returns a match when headers overlap above threshold", () => {
    const headers = ["title", "date", "location", "extra"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        catalogName: "My Catalog",
        fieldMappingOverrides: { titlePath: "title", timestampPath: "date", locationNamePath: "location" },
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.datasetId).toBe(1);
    expect(results[0]!.datasetName).toBe("Events");
    expect(results[0]!.catalogId).toBe(1);
    expect(results[0]!.catalogName).toBe("My Catalog");
    // 3 matched out of max(4 headers, 3 known) = 3/4 = 75%
    expect(results[0]!.score).toBe(75);
    expect(results[0]!.matchedColumns).toEqual(expect.arrayContaining(["title", "date", "location"]));
    expect(results[0]!.config.fieldMappingOverrides.titlePath).toBe("title");
  });

  it("returns empty array when no headers overlap", () => {
    const headers = ["alpha", "beta", "gamma"];
    const datasets = [
      makeDataset({ id: 1, name: "Events", fieldMappingOverrides: { titlePath: "title", timestampPath: "date" } }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(0);
  });

  it("returns empty array for dataset with no fieldMappingOverrides", () => {
    const headers = ["title", "date"];
    const datasets = [makeDataset({ id: 1, name: "Empty Config" })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(0);
  });

  it("ranks multiple datasets by score (highest first)", () => {
    const headers = ["title", "date", "location", "description"];
    const datasets = [
      makeDataset({ id: 1, name: "Low Match", fieldMappingOverrides: { titlePath: "title", timestampPath: "date" } }),
      makeDataset({
        id: 2,
        name: "High Match",
        fieldMappingOverrides: {
          titlePath: "title",
          timestampPath: "date",
          locationNamePath: "location",
          descriptionPath: "description",
        },
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(2);
    expect(results[0]!.datasetId).toBe(2);
    expect(results[0]!.score).toBe(100);
    expect(results[1]!.datasetId).toBe(1);
    expect(results[1]!.score).toBe(50);
  });

  it("limits results to maxResults", () => {
    const headers = ["title", "date"];
    const datasets = Array.from({ length: 5 }, (_, i) =>
      makeDataset({
        id: i + 1,
        name: `Dataset ${i + 1}`,
        fieldMappingOverrides: { titlePath: "title", timestampPath: "date" },
      })
    );

    const results = findConfigSuggestions(headers, datasets, 2);

    expect(results).toHaveLength(2);
  });

  it("matches headers case-insensitively", () => {
    const headers = ["Title", "DATE", "Location"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Case Test",
        fieldMappingOverrides: { titlePath: "title", timestampPath: "date", locationNamePath: "location" },
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.matchedColumns).toHaveLength(3);
  });

  it("includes transform 'from' fields in known columns", () => {
    const headers = ["raw_date", "raw_name", "extra"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Transform Dataset",
        fieldMappingOverrides: { titlePath: "name" },
        importTransforms: [
          { id: "t1", type: "rename" as const, from: "raw_date", to: "date", active: true },
          { id: "t2", type: "rename" as const, from: "raw_name", to: "name", active: true },
        ],
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    // 'name' from overrides + 'raw_date' and 'raw_name' from transforms = 3 known
    // 2 of 3 known match the 3 headers: raw_date, raw_name
    // score = 2 / max(3 headers, 3 known) * 100 = 67
    expect(results[0]!.matchedColumns).toEqual(expect.arrayContaining(["raw_date", "raw_name"]));
    expect(results[0]!.score).toBe(67);
  });

  it("returns empty array when headers are empty", () => {
    const datasets = [makeDataset({ id: 1, name: "Dataset", fieldMappingOverrides: { titlePath: "title" } })];

    const results = findConfigSuggestions([], datasets);

    expect(results).toHaveLength(0);
  });

  it("populates config fields with defaults when dataset fields are undefined", () => {
    const headers = ["title", "date"];
    const datasets = [
      makeDataset({ id: 1, name: "Minimal", fieldMappingOverrides: { titlePath: "title", timestampPath: "date" } }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    const config = results[0]!.config;
    expect(config.importTransforms).toEqual([]);
    expect(config.idStrategy).toEqual({ type: "auto" });
    expect(config.deduplicationConfig).toEqual({ strategy: "skip" });
    expect(config.geocodingEnabled).toBe(false);
  });

  it("uses dataset catalogName when provided", () => {
    const headers = ["title"];
    const datasets = [
      makeDataset({ id: 1, name: "DS", catalogName: "Science Data", fieldMappingOverrides: { titlePath: "title" } }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.catalogName).toBe("Science Data");
  });

  it("defaults catalogName to empty string when not provided", () => {
    const headers = ["title"];
    const datasets = [makeDataset({ id: 1, name: "DS", fieldMappingOverrides: { titlePath: "title" } })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.catalogName).toBe("");
  });
});

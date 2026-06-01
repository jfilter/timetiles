/**
 * Unit tests for config matcher service.
 *
 * Tests the pure header-matching logic that finds existing dataset configs
 * similar to an uploaded file's column structure. Datasets now carry their
 * config in the canonical `interpretationPlan` (roles + ops).
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { findConfigSuggestions } from "@/lib/ingest/config-matcher";
import { buildPlanFromPaths, type PlanRolesInput } from "@/lib/ingest/plan-builder";
import type { IngestTransform } from "@/lib/ingest/types/transforms";
import type { Dataset } from "@/payload-types";

type DatasetStub = Dataset & { catalogName?: string; catalogId?: number; schemaColumns?: string[] };

/** Create a minimal Dataset stub with an interpretation plan built from roles + transforms. */
const makeDataset = (overrides: {
  id: number;
  name: string;
  catalogName?: string;
  catalogId?: number;
  schemaColumns?: string[];
  roles?: PlanRolesInput;
  transforms?: IngestTransform[];
}): DatasetStub => {
  const { catalogName, catalogId, schemaColumns, roles, transforms, id, name } = overrides;
  const interpretationPlan =
    roles != null || transforms != null ? buildPlanFromPaths(roles ?? {}, transforms, "best-effort") : undefined;
  return {
    id,
    name,
    catalog: 1,
    language: "eng",
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
    ...(interpretationPlan ? { interpretationPlan } : {}),
    catalogName,
    catalogId: catalogId ?? 1,
    schemaColumns,
  } as DatasetStub;
};

describe("findConfigSuggestions", () => {
  it("returns a match when headers overlap above threshold", () => {
    const headers = ["title", "date", "location", "extra"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        catalogName: "My Catalog",
        roles: { titlePath: "title", timestampPath: "date", locationNamePath: "location" },
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
    expect(results[0]!.config.interpretationPlan?.roles.title).toBe("title");
  });

  it("includes endTimestamp role in known columns and returned config", () => {
    const headers = ["title", "start_date", "end_date"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        roles: { titlePath: "title", timestampPath: "start_date", endTimestampPath: "end_date" },
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.matchedColumns).toEqual(expect.arrayContaining(["title", "start_date", "end_date"]));
    expect(results[0]!.config.interpretationPlan?.roles.endTimestamp).toBe("end_date");
  });

  it("returns empty array when no headers overlap", () => {
    const headers = ["alpha", "beta", "gamma"];
    const datasets = [makeDataset({ id: 1, name: "Events", roles: { titlePath: "title", timestampPath: "date" } })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(0);
  });

  it("returns empty array for dataset with no interpretation plan", () => {
    const headers = ["title", "date"];
    const datasets = [makeDataset({ id: 1, name: "Empty Config" })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(0);
  });

  it("ranks multiple datasets by score (highest first)", () => {
    const headers = ["title", "date", "location", "description"];
    const datasets = [
      makeDataset({ id: 1, name: "Low Match", roles: { titlePath: "title", timestampPath: "date" } }),
      makeDataset({
        id: 2,
        name: "High Match",
        roles: {
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
      makeDataset({ id: i + 1, name: `Dataset ${i + 1}`, roles: { titlePath: "title", timestampPath: "date" } })
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
        roles: { titlePath: "title", timestampPath: "date", locationNamePath: "location" },
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
        roles: { titlePath: "name" },
        transforms: [
          { id: "t1", type: "rename", from: "raw_date", to: "date", active: true, autoDetected: false },
          { id: "t2", type: "rename", from: "raw_name", to: "name", active: true, autoDetected: false },
        ],
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    // 'name' from roles + 'raw_date' and 'raw_name' from transforms = 3 known
    // 2 of 3 known match the 3 headers: raw_date, raw_name
    // score = 2 / max(3 headers, 3 known) * 100 = 67
    expect(results[0]!.matchedColumns).toEqual(expect.arrayContaining(["raw_date", "raw_name"]));
    expect(results[0]!.score).toBe(67);
  });

  it("returns empty array when headers are empty", () => {
    const datasets = [makeDataset({ id: 1, name: "Dataset", roles: { titlePath: "title" } })];

    const results = findConfigSuggestions([], datasets);

    expect(results).toHaveLength(0);
  });

  it("populates config fields with defaults when dataset fields are undefined", () => {
    const headers = ["title", "date"];
    const datasets = [makeDataset({ id: 1, name: "Minimal", roles: { titlePath: "title", timestampPath: "date" } })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    const config = results[0]!.config;
    expect(config.interpretationPlan?.ops).toEqual([]);
    expect(config.idStrategy).toEqual({ type: "content-hash" });
    expect(config.deduplicationConfig).toEqual({ enabled: true });
    expect(config.geocodingEnabled).toBe(false);
  });

  it("uses dataset catalogName when provided", () => {
    const headers = ["title"];
    const datasets = [makeDataset({ id: 1, name: "DS", catalogName: "Science Data", roles: { titlePath: "title" } })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.catalogName).toBe("Science Data");
  });

  it("defaults catalogName to empty string when not provided", () => {
    const headers = ["title"];
    const datasets = [makeDataset({ id: 1, name: "DS", roles: { titlePath: "title" } })];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    expect(results[0]!.catalogName).toBe("");
  });

  it("uses schemaColumns for matching when available", () => {
    const headers = ["title", "event_date", "venue", "city", "description"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        // Only 2 roles — would give low score without schemaColumns
        roles: { titlePath: "title", timestampPath: "event_date" },
        // All 5 columns from the schema
        schemaColumns: ["title", "event_date", "venue", "city", "description"],
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    // 5 matched out of max(5, 5) = 100%
    expect(results[0]!.score).toBe(100);
  });

  it("falls back to plan roles when schemaColumns not available", () => {
    const headers = ["title", "event_date", "venue", "city", "description"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        roles: { titlePath: "title", timestampPath: "event_date" },
        // No schemaColumns
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    // Only 2 matched out of max(5, 2) = 2/5 = 40%
    expect(results[0]!.score).toBe(40);
  });

  it("combines schemaColumns with roles and transforms", () => {
    const headers = ["title", "date", "extra_col"];
    const datasets = [
      makeDataset({
        id: 1,
        name: "Events",
        roles: { titlePath: "title" },
        schemaColumns: ["title", "date"],
        transforms: [{ id: "1", type: "rename", from: "extra_col", to: "extra", active: true, autoDetected: false }],
      }),
    ];

    const results = findConfigSuggestions(headers, datasets);

    expect(results).toHaveLength(1);
    // 3 matched (title from schema, date from schema, extra_col from transform) / max(3, 3) = 100%
    expect(results[0]!.score).toBe(100);
  });
});

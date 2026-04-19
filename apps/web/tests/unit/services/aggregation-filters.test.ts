/**
 * Unit tests for SQL filter adapter.
 *
 * @module
 * @category Tests
 */
const mocks = vi.hoisted(() => ({
  mockSqlJoin: vi.fn((parts: unknown[], separator: unknown) => ({ type: "join", parts, separator })),
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings: Array.from(strings), values }),
    { join: mocks.mockSqlJoin, raw: vi.fn((value: string) => ({ type: "raw", value })) }
  ),
}));

import { describe, expect, it, vi } from "vitest";

import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toSqlConditions, toSqlWhereClause } from "@/lib/filters/to-sql-conditions";

const collectQueryStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectQueryStrings(item));
  }

  if (typeof value === "string") {
    return [value];
  }

  if (value != null && typeof value === "object") {
    return Object.values(value).flatMap((item) => collectQueryStrings(item));
  }

  return [];
};

describe("toSqlConditions", () => {
  it("builds an OR longitude clause for antimeridian-crossing bounds", () => {
    const filters: CanonicalEventFilters = {
      includePublic: true,
      catalogIds: [1],
      bounds: { north: 10, south: -10, west: 170, east: -170 },
    };

    const conditions = toSqlConditions(filters);
    const queryText = collectQueryStrings(conditions).join(" ");

    expect(queryText).toContain("e.location_longitude >= ");
    expect(queryText).toContain(" OR ");
    expect(queryText).toContain("e.location_longitude <= ");
  });

  it("returns FALSE when denyResults is true", () => {
    const filters: CanonicalEventFilters = { denyResults: true };

    const conditions = toSqlConditions(filters);
    const queryText = collectQueryStrings(conditions).join(" ");

    expect(queryText).toContain("FALSE");
  });

  it("returns FALSE when no read path is allowed", () => {
    const filters: CanonicalEventFilters = { includePublic: false };

    const conditions = toSqlConditions(filters);
    const queryText = collectQueryStrings(conditions).join(" ");

    expect(queryText).toContain("FALSE");
  });

  it("requires both coordinates when requireLocation is true", () => {
    const filters: CanonicalEventFilters = {
      includePublic: true,
      requireLocation: true,
    };

    const conditions = toSqlConditions(filters);
    const queryText = collectQueryStrings(conditions).join(" ");

    expect(queryText).toContain("e.location_latitude IS NOT NULL");
    expect(queryText).toContain("e.location_longitude IS NOT NULL");
  });
});

describe("toSqlWhereClause", () => {
  it("joins multiple conditions with AND", () => {
    const filters: CanonicalEventFilters = {
      includePublic: true,
      catalogId: 1,
      startDate: "2024-01-01",
      endDate: "2024-12-31T23:59:59.999Z",
    };

    const clause = toSqlWhereClause(filters);
    const queryText = collectQueryStrings(clause).join(" ");

    expect(queryText).toContain("d.catalog_id = ");
    expect(queryText).toContain("dataset_is_public");
    expect(queryText).toContain("e.event_timestamp >= ");
    expect(queryText).toContain("e.event_timestamp <= ");
    expect(queryText).toContain("::timestamptz");
  });
});

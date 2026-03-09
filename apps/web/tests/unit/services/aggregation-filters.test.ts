/**
 * Unit tests for aggregation filter utilities.
 *
 * @module
 * @category Tests
 */
const mocks = vi.hoisted(() => ({
  mockSqlJoin: vi.fn((parts: unknown[], separator: unknown) => ({
    type: "join",
    parts,
    separator,
  })),
}));

vi.mock("@payloadcms/db-postgres", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      type: "sql",
      strings: Array.from(strings),
      values,
    }),
    {
      join: mocks.mockSqlJoin,
      raw: vi.fn((value: string) => ({ type: "raw", value })),
    }
  ),
}));

import { describe, expect, it, vi } from "vitest";

import { buildAggregationWhereClause, normalizeEndDate } from "@/lib/services/aggregation-filters";

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

describe("aggregation-filters", () => {
  describe("normalizeEndDate", () => {
    it("should return null for null input", () => {
      expect(normalizeEndDate(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(normalizeEndDate("")).toBeNull();
    });

    it("should append end-of-day time to date-only string", () => {
      expect(normalizeEndDate("2024-12-31")).toBe("2024-12-31T23:59:59.999Z");
    });

    it("should pass through dates that already include time", () => {
      expect(normalizeEndDate("2024-12-31T12:00:00Z")).toBe("2024-12-31T12:00:00Z");
    });

    it("should pass through dates with any time component", () => {
      expect(normalizeEndDate("2024-01-01T00:00:00.000Z")).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("buildAggregationWhereClause", () => {
    it("builds an OR longitude clause for antimeridian-crossing bounds", () => {
      const clause = buildAggregationWhereClause(
        {
          bounds: {
            north: 10,
            south: -10,
            west: 170,
            east: -170,
          },
        },
        [1]
      );

      const queryText = collectQueryStrings(clause).join(" ");

      expect(queryText).toContain("e.location_longitude >= ");
      expect(queryText).toContain(" OR ");
      expect(queryText).toContain("e.location_longitude <= ");
    });

    it("returns no results instead of broadening when the requested catalog is inaccessible", () => {
      const clause = buildAggregationWhereClause(
        {
          catalog: "999",
        },
        [1, 2]
      );

      const queryText = collectQueryStrings(clause).join(" ");

      expect(queryText).toContain("FALSE");
      expect(queryText).not.toContain("d.catalog_id IN (");
    });
  });
});

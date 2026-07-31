/**
 * The SQL access clause must agree with the `events` collection's own read rule.
 *
 * Payload's rule returns `true` outright for a privileged user, while the SQL adapter used to
 * restrict every caller to public-or-owned. Since the list endpoint answers from SQL whenever
 * a field/range/cluster filter or a custom sort is present, the same request returned fewer
 * events to an admin depending only on which path it took.
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
import { toSqlWhereClause } from "@/lib/filters/to-sql-conditions";

const emittedSql = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(emittedSql).join("");
  if (typeof value === "string") return value;
  if (value != null && typeof value === "object") return Object.values(value).map(emittedSql).join("");
  return "";
};

const whereSqlFor = (filters: CanonicalEventFilters): string => emittedSql(toSqlWhereClause(filters));

describe("SQL event access clause", () => {
  it("restricts an ordinary user to public or owned events", () => {
    const sqlText = whereSqlFor({ includePublic: true, ownerId: 42 });

    expect(sqlText).toContain("dataset_is_public");
    expect(sqlText).toContain("catalog_owner_id");
  });

  it("restricts an anonymous caller to public events", () => {
    const sqlText = whereSqlFor({ includePublic: true });

    expect(sqlText).toContain("dataset_is_public");
    expect(sqlText).not.toContain("catalog_owner_id");
  });

  it("applies no access clause for a privileged caller", () => {
    const sqlText = whereSqlFor({ includePublic: true, ownerId: 42, unrestrictedAccess: true });

    expect(sqlText).not.toContain("dataset_is_public");
    expect(sqlText).not.toContain("catalog_owner_id");
  });

  it("still matches nothing when access resolved to neither public nor owned", () => {
    const sqlText = whereSqlFor({ includePublic: false });

    expect(sqlText).toContain("FALSE");
  });
});

/**
 * The SQL and Payload output adapters must express the SAME access grant.
 *
 * The public event API is scoped to public-or-owned for every caller, including admins and
 * editors — the collection-level privilege bypass belongs to the admin panel, not here. The
 * two adapters are documented mirrors, and a request must not change what it returns just
 * because a filter or a custom sort pushed it from the Payload path onto the SQL path.
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
import { toPayloadWhere } from "@/lib/filters/to-payload-where";
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

  // The two adapters are documented mirrors. The list endpoint picks between them per request
  // (SQL when a field/range/cluster filter or a custom sort is present, Payload otherwise), so
  // any grant one expresses and the other does not silently changes what a request returns.
  it.each([
    { label: "an authenticated caller", filters: { includePublic: true, ownerId: 42 } },
    { label: "an anonymous caller", filters: { includePublic: true } },
    { label: "no grant at all", filters: { includePublic: false } },
  ])("expresses the same grant as the Payload adapter for $label", ({ filters }) => {
    const sqlText = whereSqlFor(filters);
    const payloadWhere = JSON.stringify(toPayloadWhere(filters));

    expect(sqlText.includes("dataset_is_public")).toBe(payloadWhere.includes("datasetIsPublic"));
    expect(sqlText.includes("catalog_owner_id")).toBe(payloadWhere.includes("catalogOwnerId"));
    // Neither adapter takes a role: the public event API is scoped to public-or-owned for
    // every caller, and the collection-level privilege bypass belongs to the admin panel.
    expect(sqlText.includes("FALSE")).toBe(payloadWhere.includes('"equals":-1'));
  });

  it("still matches nothing when access resolved to neither public nor owned", () => {
    const sqlText = whereSqlFor({ includePublic: false });

    expect(sqlText).toContain("FALSE");
  });
});

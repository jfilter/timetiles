/**
 * Unit tests for the Payload Where adapter's access-control clause.
 *
 * Must mirror buildEventAccessCondition in to-sql-conditions.ts so the two
 * adapters never diverge on who can see which events.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { toPayloadWhere } from "@/lib/filters/to-payload-where";

const accessClause = (filters: Parameters<typeof toPayloadWhere>[0]) => {
  const where = toPayloadWhere(filters);
  return (where.and as unknown[])[0];
};

describe("toPayloadWhere access control", () => {
  it("defaults to public events only", () => {
    expect(accessClause({})).toEqual({ datasetIsPublic: { equals: true } });
  });

  it("grants public OR owner when an owner is present", () => {
    expect(accessClause({ ownerId: 7 })).toEqual({
      or: [{ datasetIsPublic: { equals: true } }, { catalogOwnerId: { equals: 7 } }],
    });
  });

  it("restricts to owner-only when includePublic is false", () => {
    expect(accessClause({ includePublic: false, ownerId: 7 })).toEqual({ catalogOwnerId: { equals: 7 } });
  });

  it("matches nothing when includePublic is false and there is no owner (SQL FALSE)", () => {
    expect(accessClause({ includePublic: false })).toEqual({ id: { equals: -1 } });
  });
});

/**
 * Unit tests for the shared event query context resolver.
 *
 * The cross-dataset gate denies range-filtered queries that do not resolve to a
 * single dataset. That deny is set AFTER the initial check, and the JSONB
 * adapters used by the PG-function endpoints cannot carry it — so the resolver
 * itself must report `denied`, or those endpoints return unfiltered rows where
 * the SQL path returns none.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { resolveEventQueryContext } from "@/lib/services/resolve-event-query-context";

const payloadStub = { findByID: vi.fn() } as never;

describe("resolveEventQueryContext", () => {
  it("denies range-filtered queries that do not resolve to exactly one dataset", async () => {
    const result = await resolveEventQueryContext({
      payload: payloadStub,
      user: null,
      query: { ff: {}, rf: { price: { min: 1000 } } },
    });

    expect(result.denied).toBe(true);
  });

  it("allows an unfiltered query", async () => {
    const result = await resolveEventQueryContext({ payload: payloadStub, user: null, query: { ff: {}, rf: {} } });

    expect(result.denied).toBe(false);
  });
});

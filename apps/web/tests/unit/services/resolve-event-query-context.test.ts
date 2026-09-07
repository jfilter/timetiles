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
  it.each<{ name: string; dataset: unknown; rf: Record<string, { min?: number; max?: number }> }>([
    { name: "missing dataset", dataset: null, rf: { price: { min: 10 } } },
    { name: "missing plan", dataset: {}, rf: { price: { min: 10 } } },
    {
      name: "partially resolvable filters",
      dataset: {
        interpretationPlan: {
          ops: [],
          columns: [{ field: "price", kind: "number", policy: { kind: "number" } }],
          roles: {},
          ambiguityResolution: "strict",
        },
      },
      rf: { price: { min: 10 }, missing: { max: 20 } },
    },
  ])("denies numeric filters with $name", async ({ dataset, rf }) => {
    const payload = { findByID: vi.fn().mockResolvedValue(dataset) } as never;
    const result = await resolveEventQueryContext({ payload, query: { datasets: [1], ff: {}, rf } });

    expect(result.denied).toBe(true);
  });

  it("preserves a numeric filter with a resolved number policy", async () => {
    const payload = {
      findByID: vi
        .fn()
        .mockResolvedValue({
          interpretationPlan: {
            ops: [],
            columns: [{ field: "price", kind: "number", policy: { kind: "number" } }],
            roles: {},
            ambiguityResolution: "strict",
          },
        }),
    } as never;
    const result = await resolveEventQueryContext({
      payload,
      query: { datasets: [1], ff: {}, rf: { price: { min: 10 } } },
    });

    expect(result.denied).toBe(false);
    if (!result.denied) {
      expect(result.filters.rangeFilters).toEqual({ price: { min: 10, max: null } });
      expect(result.filters.numberFormats).toEqual({ price: { decimalSeparator: ".", thousandsSeparator: null } });
    }
  });

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

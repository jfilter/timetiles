/**
 * Unit tests for filter-state serialization helpers.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { type FilterState, serializeFilterKey } from "@/lib/types/filter-state";

describe("serializeFilterKey", () => {
  const filters: FilterState = {
    datasets: ["d1"],
    startDate: null,
    endDate: null,
    fieldFilters: { category: ["a"], _city: ["berlin"], year: ["2026"] },
  };

  it("produces the same key regardless of fieldFilters insertion order", () => {
    const reordered: FilterState = { ...filters, fieldFilters: { year: ["2026"], category: ["a"], _city: ["berlin"] } };
    expect(serializeFilterKey(filters)).toBe(serializeFilterKey(reordered));
  });

  it("sorts keys locale-independently so the key is stable across environments", () => {
    // Regression: keys were sorted with String.prototype.localeCompare, whose
    // ordering depends on the runtime locale/ICU. The serialized key must not
    // depend on localeCompare.
    const expected = serializeFilterKey(filters);

    const spy = vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      that: string
    ): number {
      if (this < that) return 1;
      if (this > that) return -1;
      return 0;
    });
    try {
      expect(serializeFilterKey(filters)).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});

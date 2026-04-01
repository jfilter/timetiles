/**
 * Unit tests for buildFullRangeFilters.
 *
 * Ensures the time range slider histogram strips dates but preserves
 * field filters so the temporal distribution reflects category selections.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { buildFullRangeFilters } from "@/lib/hooks/use-events-queries";

describe("buildFullRangeFilters", () => {
  it("strips startDate and endDate", () => {
    const result = buildFullRangeFilters({
      datasets: ["1"],
      startDate: "2020-01-01",
      endDate: "2020-12-31",
      fieldFilters: {},
    });
    expect(result.startDate).toBeNull();
    expect(result.endDate).toBeNull();
  });

  it("preserves fieldFilters", () => {
    const ff = { Province: ["Kayin state"], event_summary: ["State-based"] };
    const result = buildFullRangeFilters({
      datasets: ["133"],
      startDate: "2020-01-01",
      endDate: "2020-12-31",
      fieldFilters: ff,
    });
    expect(result.fieldFilters).toEqual(ff);
  });

  it("preserves datasets", () => {
    const result = buildFullRangeFilters({
      datasets: ["1", "2", "3"],
      startDate: null,
      endDate: null,
      fieldFilters: {},
    });
    expect(result.datasets).toEqual(["1", "2", "3"]);
  });
});

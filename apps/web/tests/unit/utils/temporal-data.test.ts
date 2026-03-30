/**
 * Tests for the temporal data visibility utility.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import type { DataSourceDataset } from "@/lib/types/data-sources";
import type { FilterState } from "@/lib/types/filter-state";
import { hasVisibleTemporalData } from "@/lib/utils/temporal-data";

const temporal = (id: number, catalogId: number): DataSourceDataset => ({
  id,
  name: `Dataset ${id}`,
  catalogId,
  hasTemporalData: true,
});

const nonTemporal = (id: number, catalogId: number): DataSourceDataset => ({
  id,
  name: `Dataset ${id}`,
  catalogId,
  hasTemporalData: false,
});

const noFilters: Pick<FilterState, "datasets"> = { datasets: [] };
const datasetFilter = (...ids: number[]): Pick<FilterState, "datasets"> => ({ datasets: ids.map(String) });

describe("hasVisibleTemporalData", () => {
  it("returns true when datasets are undefined (loading)", () => {
    expect(hasVisibleTemporalData(undefined, noFilters)).toBe(true);
  });

  it("returns true when datasets array is empty", () => {
    expect(hasVisibleTemporalData([], noFilters)).toBe(true);
  });

  it("returns true when all datasets have temporal data", () => {
    const datasets = [temporal(1, 10), temporal(2, 10)];
    expect(hasVisibleTemporalData(datasets, noFilters)).toBe(true);
  });

  it("returns false when no datasets have temporal data", () => {
    const datasets = [nonTemporal(1, 10), nonTemporal(2, 10)];
    expect(hasVisibleTemporalData(datasets, noFilters)).toBe(false);
  });

  it("returns true for mixed datasets (some temporal, some not)", () => {
    const datasets = [temporal(1, 10), nonTemporal(2, 10)];
    expect(hasVisibleTemporalData(datasets, noFilters)).toBe(true);
  });

  describe("with dataset filter", () => {
    it("returns false when all selected datasets are non-temporal", () => {
      const datasets = [temporal(1, 10), nonTemporal(2, 10), nonTemporal(3, 10)];
      expect(hasVisibleTemporalData(datasets, datasetFilter(2, 3))).toBe(false);
    });

    it("returns true when at least one selected dataset is temporal", () => {
      const datasets = [temporal(1, 10), nonTemporal(2, 10)];
      expect(hasVisibleTemporalData(datasets, datasetFilter(1, 2))).toBe(true);
    });

    it("returns true when selected dataset IDs match no datasets (safe default)", () => {
      const datasets = [nonTemporal(1, 10)];
      expect(hasVisibleTemporalData(datasets, datasetFilter(99))).toBe(true);
    });

    it("returns false when filtering to only non-temporal datasets in a catalog", () => {
      const datasets = [temporal(1, 10), nonTemporal(2, 20), nonTemporal(3, 20)];
      expect(hasVisibleTemporalData(datasets, datasetFilter(2, 3))).toBe(false);
    });

    it("returns true when filtering to a mix of temporal and non-temporal in a catalog", () => {
      const datasets = [nonTemporal(1, 10), temporal(2, 20), nonTemporal(3, 20)];
      expect(hasVisibleTemporalData(datasets, datasetFilter(2, 3))).toBe(true);
    });
  });
});

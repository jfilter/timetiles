/**
 * Unit tests for explorer-helpers description builder.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import type { DataSourceCatalog, DataSourceDataset } from "@/lib/hooks/use-data-sources-query";
import type { FilterState } from "@/lib/types/filter-state";

import {
  buildEventsDescription,
  type FilterLabels,
  getFilterLabels,
  getInitialViewState,
  shouldResetGroupBy,
  type TranslateFn,
} from "../../../app/[locale]/(frontend)/explore/_components/explorer-helpers";

/** Simple passthrough translator that interpolates {key} placeholders */
const mockT: TranslateFn = (key, values) => {
  const translations: Record<string, string> = {
    descShowingAll: "Showing all {count} events",
    descShowingEvents: "Showing {count} events",
    descShowingOfTotal: "Showing {visible} of {total} events",
    descFromDatasets: " from {datasets}",
    descInMapView: " in the map view",
    descFilteredBy: ", filtered by {filters}",
    descSpanning: ", {dateRange}",
    descSince: "since {date}",
    descUntil: "until {date}",
    descJoinTwo: "{first} and {second}",
    descJoinMore: "{first}, {second} and {count} more",
  };
  let result = translations[key] ?? key;
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      // Mirror next-intl: numeric ICU args (count/visible/total) are locale-formatted
      // with grouping (e.g. 8135 -> "8,135"), so the count args are now passed raw.
      result = result.replace(`{${k}}`, typeof v === "number" ? v.toLocaleString("en-US") : String(v));
    }
  }
  return result;
};

const baseLabels: FilterLabels = { datasets: [] };

describe("buildEventsDescription", () => {
  it("shows 'since' for start-date-only filter", () => {
    const labels: FilterLabels = { ...baseLabels, dateRange: { type: "since", formatted: "Feb 11, 1996" } };
    const result = buildEventsDescription(100, 100, labels, false, mockT);
    expect(result).toBe("Showing all 100 events, since Feb 11, 1996.");
  });

  it("shows 'until' for end-date-only filter", () => {
    const labels: FilterLabels = { ...baseLabels, dateRange: { type: "until", formatted: "Dec 31, 2024" } };
    const result = buildEventsDescription(50, 50, labels, false, mockT);
    expect(result).toBe("Showing all 50 events, until Dec 31, 2024.");
  });

  it("shows plain range for both dates", () => {
    const labels: FilterLabels = { ...baseLabels, dateRange: { type: "range", formatted: "Jan 1 – Dec 31, 2024" } };
    const result = buildEventsDescription(200, 200, labels, false, mockT);
    expect(result).toBe("Showing all 200 events, Jan 1 – Dec 31, 2024.");
  });

  it("omits date range when not set", () => {
    const result = buildEventsDescription(10, 10, baseLabels, false, mockT);
    expect(result).toBe("Showing all 10 events.");
  });

  it("combines dataset and date range", () => {
    const labels: FilterLabels = {
      datasets: [{ id: "1", name: "Myanmar" }],
      dateRange: { type: "since", formatted: "Feb 11, 1996" },
    };
    const result = buildEventsDescription(8135, 8135, labels, false, mockT);
    expect(result).toBe("Showing all 8,135 events from Myanmar, since Feb 11, 1996.");
  });
});

describe("shouldResetGroupBy", () => {
  const loadedOptions = [{ value: "none" }, { value: "dataset" }];

  it("keeps a URL-restored 'catalog' while the option list is still loading", () => {
    // A shared link carries ?groupBy=catalog. Until the data-sources query
    // resolves, "catalog" is not in the option list — resetting here would
    // silently drop the shared selection before it could ever be honoured.
    expect(shouldResetGroupBy("catalog", [{ value: "none" }], true)).toBe(false);
  });

  it("resets a built-in value that is genuinely unavailable once loaded", () => {
    expect(shouldResetGroupBy("catalog", loadedOptions, false)).toBe(true);
  });

  it("keeps a built-in value that is present in the loaded options", () => {
    expect(shouldResetGroupBy("dataset", loadedOptions, false)).toBe(false);
  });

  it("never resets 'none'", () => {
    expect(shouldResetGroupBy("none", [], false)).toBe(false);
  });

  it("never resets custom field paths — the API tolerates unknown fields", () => {
    expect(shouldResetGroupBy("data.agency", loadedOptions, false)).toBe(false);
  });
});

describe("getFilterLabels dataset fallback", () => {
  const filters = { datasets: ["42"], startDate: null, endDate: null } as unknown as FilterState;
  const catalogs: DataSourceCatalog[] = [];

  it("uses the caller-supplied localized label for an unresolved dataset", () => {
    // Regression: a hardcoded English "Unknown Dataset" used to leak into the
    // localized explore description for every locale.
    const labels = getFilterLabels(filters, catalogs, [], "Unbekannter Datensatz", "de");
    expect(labels.datasets).toEqual([{ id: "42", name: "Unbekannter Datensatz" }]);
  });

  it("prefers the real dataset name when it resolves", () => {
    const datasets = [{ id: 42, name: "Myanmar" }] as unknown as DataSourceDataset[];
    const labels = getFilterLabels(filters, catalogs, datasets, "Unbekannter Datensatz", "de");
    expect(labels.datasets).toEqual([{ id: "42", name: "Myanmar" }]);
  });
});

describe("getInitialViewState", () => {
  it("returns the view state for valid coordinates", () => {
    const result = getInitialViewState(true, { latitude: 10, longitude: 20, zoom: 5 });
    expect(result).toEqual({ latitude: 10, longitude: 20, zoom: 5 });
  });

  it("rejects an out-of-range latitude (e.g. ?lat=95) instead of crashing MapLibre downstream", () => {
    const result = getInitialViewState(true, { latitude: 95, longitude: 10, zoom: 5 });
    expect(result).toBeNull();
  });

  it("rejects an out-of-range longitude", () => {
    const result = getInitialViewState(true, { latitude: 10, longitude: 200, zoom: 5 });
    expect(result).toBeNull();
  });

  it("rejects non-finite values", () => {
    const result = getInitialViewState(true, { latitude: Number.NaN, longitude: 10, zoom: 5 });
    expect(result).toBeNull();
  });
});

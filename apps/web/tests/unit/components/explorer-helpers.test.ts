/**
 * Unit tests for explorer-helpers description builder.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import {
  buildEventsDescription,
  type FilterLabels,
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
      result = result.replace(`{${k}}`, String(v));
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

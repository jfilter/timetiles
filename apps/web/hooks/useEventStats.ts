import { useMemo } from "react";
import type { Event, Dataset, Catalog } from "../payload-types";
import type { BarChartDataItem } from "@workspace/ui/components/charts";

export interface EventStats {
  totalEvents: number;
  eventsWithLocation: number;
  eventsWithoutLocation: number;
  dateRange: {
    min: Date | null;
    max: Date | null;
  };
  eventsByDataset: Record<string, number>;
  eventsByCatalog: Record<string, number>;
}

export function useEventStats(events: Event[]): EventStats {
  return useMemo(() => {
    const stats: EventStats = {
      totalEvents: events.length,
      eventsWithLocation: 0,
      eventsWithoutLocation: 0,
      dateRange: {
        min: null,
        max: null,
      },
      eventsByDataset: {},
      eventsByCatalog: {},
    };

    if (events.length === 0) return stats;

    const dates: Date[] = [];

    events.forEach((event) => {
      // Location stats
      if (event.location?.latitude && event.location?.longitude) {
        stats.eventsWithLocation++;
      } else {
        stats.eventsWithoutLocation++;
      }

      // Date tracking
      if (event.eventTimestamp) {
        dates.push(new Date(event.eventTimestamp));
      }

      // Dataset stats
      const datasetId =
        typeof event.dataset === "object"
          ? String(event.dataset.id)
          : String(event.dataset);

      if (datasetId) {
        stats.eventsByDataset[datasetId] =
          (stats.eventsByDataset[datasetId] ?? 0) + 1;
      }

      // Catalog stats (through dataset)
      if (typeof event.dataset === "object" && event.dataset.catalog) {
        const catalogId =
          typeof event.dataset.catalog === "object"
            ? String(event.dataset.catalog.id)
            : String(event.dataset.catalog);

        if (catalogId) {
          stats.eventsByCatalog[catalogId] =
            (stats.eventsByCatalog[catalogId] ?? 0) + 1;
        }
      }
    });

    // Calculate date range
    if (dates.length > 0) {
      stats.dateRange.min = new Date(
        Math.min(...dates.map((d) => d.getTime())),
      );
      stats.dateRange.max = new Date(
        Math.max(...dates.map((d) => d.getTime())),
      );
    }

    return stats;
  }, [events]);
}

export function useEventDateAccessor() {
  return useMemo(() => {
    return (event: Event) => {
      if (!event.eventTimestamp) return new Date();
      return new Date(event.eventTimestamp);
    };
  }, []);
}

export function useEventsByDataset(
  events: Event[],
  datasets: Dataset[],
): BarChartDataItem[] {
  return useMemo(() => {
    const datasetMap = new Map(datasets.map((d) => [String(d.id), d]));
    const eventCounts = new Map<string, number>();

    events.forEach((event) => {
      const datasetId =
        typeof event.dataset === "object"
          ? String(event.dataset.id)
          : String(event.dataset);

      eventCounts.set(datasetId, (eventCounts.get(datasetId) ?? 0) + 1);
    });

    return Array.from(eventCounts.entries())
      .map(([datasetId, count]) => {
        const dataset = datasetMap.get(datasetId);
        return {
          label: dataset?.name ?? `Dataset ${datasetId}`,
          value: count,
          metadata: { datasetId, dataset },
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [events, datasets]);
}

export function useEventsByCatalog(
  events: Event[],
  catalogs: Catalog[],
): BarChartDataItem[] {
  return useMemo(() => {
    const catalogMap = new Map(catalogs.map((c) => [String(c.id), c]));
    const catalogCounts = new Map<string, number>();

    events.forEach((event) => {
      if (typeof event.dataset === "object" && event.dataset.catalog) {
        const catalogId =
          typeof event.dataset.catalog === "object"
            ? String(event.dataset.catalog.id)
            : String(event.dataset.catalog);

        catalogCounts.set(catalogId, (catalogCounts.get(catalogId) ?? 0) + 1);
      }
    });

    return Array.from(catalogCounts.entries())
      .map(([catalogId, count]) => {
        const catalog = catalogMap.get(catalogId);
        return {
          label: catalog?.name ?? `Catalog ${catalogId}`,
          value: count,
          metadata: { catalogId, catalog },
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [events, catalogs]);
}

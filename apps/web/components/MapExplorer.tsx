"use client";

import { useEffect, useState, useTransition } from "react";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import type { Catalog, Dataset, Event } from "../payload-types";
import { Map } from "./Map";
import { EventsList } from "./EventsList";
import { EventFilters } from "./EventFilters";
import { ChartSection } from "./ChartSection";
import type { LngLatBounds } from "maplibre-gl";

interface MapExplorerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export function MapExplorer({ catalogs, datasets }: MapExplorerProps) {
  const [events, setEvents] = useState<Event[]>([]);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [isPending, startTransition] = useTransition();

  const [filters] = useQueryStates({
    catalog: parseAsString,
    datasets: parseAsArrayOf(parseAsString).withDefault([]),
    startDate: parseAsString,
    endDate: parseAsString,
  });

  useEffect(() => {
    // Cancel any previous requests if pending
    const abortController = new AbortController();
    
    const fetchEvents = async () => {
      const params = new URLSearchParams();

      if (filters.catalog) {
        params.append("catalog", filters.catalog);
      }

      filters.datasets.forEach((datasetId) => {
        params.append("datasets", datasetId);
      });

      if (filters.startDate) {
        params.append("startDate", filters.startDate);
      }

      if (filters.endDate) {
        params.append("endDate", filters.endDate);
      }

      if (bounds) {
        params.append(
          "bounds",
          JSON.stringify({
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          }),
        );
      }

      try {
        const response = await fetch(`/api/events?${params.toString()}`, {
          signal: abortController.signal,
        });
        if (response.ok && !abortController.signal.aborted) {
          const data = await response.json();
          startTransition(() => {
            setEvents(data.docs || []);
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Failed to fetch events:", error);
        }
      }
    };

    fetchEvents();
    
    return () => {
      abortController.abort();
    };
  }, [
    filters.catalog,
    filters.datasets,
    filters.startDate,
    filters.endDate,
    bounds,
  ]);

  const mapEvents = events
    .filter((event) => event.location?.longitude && event.location?.latitude)
    .map((event) => {
      const eventData =
        typeof event.data === "object" &&
        event.data !== null &&
        !Array.isArray(event.data)
          ? (event.data as Record<string, unknown>)
          : {};

      return {
        id: String(event.id),
        longitude: event.location!.longitude!,
        latitude: event.location!.latitude!,
        title: (eventData.title ||
          eventData.name ||
          `Event ${event.id}`) as string,
      };
    });

  return (
    <div className="flex h-screen">
      <div className="h-full w-1/2">
        <Map events={mapEvents} onBoundsChange={setBounds} />
      </div>

      <div className="h-full w-1/2 overflow-y-auto border-l">
        <div className="p-6">
          <h1 className="mb-6 text-2xl font-bold">Event Explorer</h1>

          <div className="mb-6">
            <EventFilters catalogs={catalogs} datasets={datasets} />
          </div>

          <div className="mb-6 border-t pt-6">
            <ChartSection
              events={events}
              datasets={datasets}
              catalogs={catalogs}
              loading={isPending}
            />
          </div>

          <div className="border-t pt-6">
            <h2 className="mb-4 text-lg font-semibold">
              Events ({events.length})
            </h2>
            <EventsList events={events} loading={isPending} />
          </div>
        </div>
      </div>
    </div>
  );
}

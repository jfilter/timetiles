"use client";

import { useEffect, useState, useTransition } from "react";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import type { Catalog, Dataset, Event } from "../payload-types";
import { Map } from "./Map";
import { EventsList } from "./EventsList";
import { EventFilters } from "./EventFilters";
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
    startTransition(async () => {
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
        params.append("bounds", JSON.stringify({
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        }));
      }

      try {
        const response = await fetch(`/api/events?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setEvents(data.docs || []);
        }
      } catch (error) {
        console.error("Failed to fetch events:", error);
      }
    });
  }, [filters.catalog, filters.datasets, filters.startDate, filters.endDate, bounds]);

  const mapEvents = events
    .filter((event) => event.location?.longitude && event.location?.latitude)
    .map((event) => {
      const eventData = typeof event.data === 'object' && event.data !== null && !Array.isArray(event.data) 
        ? event.data as Record<string, unknown>
        : {};
      
      return {
        id: String(event.id),
        longitude: event.location!.longitude!,
        latitude: event.location!.latitude!,
        title: (eventData.title || eventData.name || `Event ${event.id}`) as string,
      };
    });

  return (
    <div className="flex h-screen">
      <div className="w-1/2 h-full">
        <Map events={mapEvents} onBoundsChange={setBounds} />
      </div>
      
      <div className="w-1/2 h-full overflow-y-auto border-l">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Event Explorer</h1>
          
          <div className="mb-6">
            <EventFilters catalogs={catalogs} datasets={datasets} />
          </div>
          
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">
              Events ({events.length})
            </h2>
            <EventsList events={events} loading={isPending} />
          </div>
        </div>
      </div>
    </div>
  );
}
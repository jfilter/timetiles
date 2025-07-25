"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import "maplibre-gl/dist/maplibre-gl.css";
import { logger } from "@/lib/logger";

interface MapProps {
  onBoundsChange?: (bounds: maplibregl.LngLatBounds) => void;
  events?: Array<{
    id: string;
    longitude: number;
    latitude: number;
    title?: string;
  }>;
}

export const MapComponent = ({ onBoundsChange, events = [] }: Readonly<MapProps>) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: "https://tiles.versatiles.org/assets/styles/colorful/style.json",
        center: [0, 40],
        zoom: 2,
      });

      map.current.on("load", () => {
        setIsLoaded(true);
      });

      map.current.on("error", (e) => {
        logger.error("Map error:", e);
      });

      map.current.on("webglcontextlost", (e: Event) => {
        e.preventDefault();
      });

      map.current.on("moveend", () => {
        if (map.current && onBoundsChange) {
          onBoundsChange(map.current.getBounds());
        }
      });
    } catch (error) {
      logger.error("Failed to initialize map:", error);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [onBoundsChange]); // Include onBoundsChange in dependency array

  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const markers: maplibregl.Marker[] = [];

    events.forEach((event) => {
      const marker = new maplibregl.Marker()
        .setLngLat([event.longitude, event.latitude])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<h3>${event.title ?? "Event"}</h3>`))
        .addTo(map.current!);

      markers.push(marker);
    });

    return () => {
      markers.forEach((marker) => marker.remove());
    };
  }, [events, isLoaded]);

  return (
    <div ref={mapContainer} className="h-full w-full" role="region" aria-label="Map" style={{ minHeight: "400px" }} />
  );
};

/**
 * Base map component using MapLibre GL.
 *
 * Provides a foundational map component with Mapbox tiles, supporting
 * various map interactions, custom overlays, and event handlers.
 * Used as the base for more specialized map components.
 *
 * @module
 * @category Components
 */
"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { useTheme } from "@/lib/hooks/use-theme";
import { logger } from "@/lib/logger";

// Map style URLs for light and dark themes
const MAP_STYLES = {
  light: "/map-styles/cartographic.json",
  dark: "/map-styles/cartographic-dark.json",
} as const;

interface MapProps {
  onBoundsChange?: (bounds: maplibregl.LngLatBounds) => void;
  events?: Array<{
    id: string;
    longitude: number;
    latitude: number;
    title?: string;
  }>;
}

const DEFAULT_EVENTS: MapProps["events"] = [];
const MAP_STYLE = { minHeight: "400px" };

export const MapComponent = ({ onBoundsChange, events = DEFAULT_EVENTS }: Readonly<MapProps>) => {
  const { resolvedTheme } = useTheme();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Select map style based on theme
  const mapStyleUrl = MAP_STYLES[resolvedTheme];

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyleUrl,
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
  }, [onBoundsChange, mapStyleUrl]); // Include mapStyleUrl in dependency array

  // Update map style when theme changes
  useEffect(() => {
    if (map.current && isLoaded) {
      map.current.setStyle(mapStyleUrl);
    }
  }, [mapStyleUrl, isLoaded]);

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

  return <section ref={mapContainer} className="h-full w-full" aria-label="Map" style={MAP_STYLE} />;
};

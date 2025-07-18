"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface ClusteredMapProps {
  onBoundsChange?: (bounds: maplibregl.LngLatBounds) => void;
  onZoomChange?: (zoom: number) => void;
  clusters?: any[]; // GeoJSON features from the clustering API
}

export function ClusteredMap({
  onBoundsChange,
  onZoomChange,
  clusters = [],
}: ClusteredMapProps) {
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

        // Add source for clusters
        map.current!.addSource("events", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });

        // Add layer for clusters
        map.current!.addLayer({
          id: "clusters",
          type: "circle",
          source: "events",
          filter: ["==", ["get", "type"], "cluster"],
          paint: {
            "circle-color": [
              "step",
              ["get", "count"],
              "#51bbd6",
              10,
              "#f1f075",
              100,
              "#f28cb1",
            ],
            "circle-radius": ["step", ["get", "count"], 20, 10, 25, 100, 30],
          },
        });

        // Add layer for cluster counts
        map.current!.addLayer({
          id: "cluster-count",
          type: "symbol",
          source: "events",
          filter: ["==", ["get", "type"], "cluster"],
          layout: {
            "text-field": "{count}",
            "text-font": ["Open Sans Semibold"],
            "text-size": 12,
          },
        });

        // Add layer for individual events
        map.current!.addLayer({
          id: "unclustered-point",
          type: "circle",
          source: "events",
          filter: ["==", ["get", "type"], "event"],
          paint: {
            "circle-color": "#11b4da",
            "circle-radius": 6,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          },
        });

        // Click handler for clusters
        map.current!.on("click", "clusters", (e) => {
          const feature = e.features?.[0];
          if (!feature || !feature.properties) return;

          const bbox = feature.properties.bbox;
          if (bbox) {
            // Zoom to cluster bounds
            const bounds = JSON.parse(bbox);
            map.current!.fitBounds(
              [
                [bounds.west, bounds.south],
                [bounds.east, bounds.north],
              ],
              { padding: 50 },
            );
          }
        });

        // Click handler for individual events
        map.current!.on("click", "unclustered-point", (e) => {
          const feature = e.features?.[0];
          if (!feature || !feature.geometry || !feature.properties) return;

          const coordinates = (feature.geometry as any).coordinates.slice();
          const { title, id } = feature.properties;

          new maplibregl.Popup()
            .setLngLat(coordinates as [number, number])
            .setHTML(`<h3>${title || `Event ${id}`}</h3>`)
            .addTo(map.current!);
        });

        // Change cursor on hover
        map.current!.on("mouseenter", "clusters", () => {
          map.current!.getCanvas().style.cursor = "pointer";
        });
        map.current!.on("mouseleave", "clusters", () => {
          map.current!.getCanvas().style.cursor = "";
        });
        map.current!.on("mouseenter", "unclustered-point", () => {
          map.current!.getCanvas().style.cursor = "pointer";
        });
        map.current!.on("mouseleave", "unclustered-point", () => {
          map.current!.getCanvas().style.cursor = "";
        });
      });

      map.current.on("moveend", () => {
        if (map.current) {
          if (onBoundsChange) {
            onBoundsChange(map.current.getBounds());
          }
          if (onZoomChange) {
            onZoomChange(map.current.getZoom());
          }
        }
      });

      map.current.on("error", (e) => {
        console.error("Map error:", e);
      });

      map.current.on("webglcontextlost", (e: any) => {
        e.preventDefault();
      });
    } catch (error) {
      console.error("Failed to initialize map:", error);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []); // No dependencies to prevent constant rebuilds

  // Update clusters data when it changes
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    const source = map.current.getSource("events") as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({
        type: "FeatureCollection",
        features: clusters,
      });
    }
  }, [clusters, isLoaded]);

  return (
    <div
      ref={mapContainer}
      className="h-full w-full"
      role="region"
      aria-label="Map"
      style={{ minHeight: "400px" }}
    />
  );
}

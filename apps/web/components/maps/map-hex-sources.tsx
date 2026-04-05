/**
 * Renders all hex-related map sources and layers for the ClusteredMap component.
 *
 * Centralises hexagon-mode layers, merge-group outlines, hover heatmap,
 * focus overlays and sub-cell heatmap into a single composable component so
 * that ClusteredMap's render function stays concise.
 *
 * @module
 * @category Components
 */
"use client";

import type { MapColors } from "@timetiles/ui/lib/chart-themes";
import { Layer, Source } from "react-map-gl/maplibre";

import {
  buildH3FillLayerConfig,
  buildH3HoverFillLayerConfig,
  buildH3HoverOutlineLayerConfig,
  buildH3OutlineLayerConfig,
} from "./clustered-map-helpers";

interface MapHexSourcesProps {
  mapColors: MapColors;
  maxCount: number;
  hexagonMode: boolean;
  algorithm: string;
  showHex: boolean;
  h3HexData: GeoJSON.FeatureCollection;
  mergeGroupData: GeoJSON.FeatureCollection;
  hoverHexData: GeoJSON.FeatureCollection;
  focusedCluster: unknown;
  focusHexData: GeoJSON.FeatureCollection;
  focusSubcellHexData: GeoJSON.FeatureCollection;
}

export const MapHexSources = ({
  mapColors,
  maxCount,
  hexagonMode,
  algorithm,
  showHex,
  h3HexData,
  mergeGroupData,
  hoverHexData,
  focusedCluster,
  focusHexData,
  focusSubcellHexData,
}: MapHexSourcesProps) => {
  const h3FillLayer = buildH3FillLayerConfig(mapColors, maxCount);
  const h3OutlineLayer = buildH3OutlineLayerConfig(mapColors);
  const h3HoverFillLayer = buildH3HoverFillLayerConfig(mapColors);
  const h3HoverOutlineLayer = buildH3HoverOutlineLayerConfig();

  return (
    <>
      {/* Hexagon mode: filled hex polygons as primary layer */}
      {hexagonMode && h3HexData.features.length > 0 && (
        <Source type="geojson" data={h3HexData} id="h3-hex-source">
          <Layer
            {...buildH3FillLayerConfig(mapColors, maxCount)}
            paint={{ ...buildH3FillLayerConfig(mapColors, maxCount).paint, "fill-opacity": 0.7 }}
          />
          <Layer {...h3OutlineLayer} paint={{ ...h3OutlineLayer.paint, "line-opacity": 0.8, "line-width": 1.5 }} />
        </Source>
      )}
      {/* Circle mode: merge group outlines (hex footprint behind merged circles) */}
      {!hexagonMode && mergeGroupData.features.length > 0 && (
        <Source type="geojson" data={mergeGroupData} id="merge-group-source">
          <Layer
            id="merge-group-fill"
            type="fill"
            paint={{ "fill-color": mapColors.mapClusterGradient[1], "fill-opacity": 0.15 }}
          />
          <Layer
            id="merge-group-outline"
            type="line"
            paint={{ "line-color": mapColors.mapClusterGradient[2], "line-width": 1.5, "line-opacity": 0.5 }}
          />
        </Source>
      )}
      {/* Circle mode: optional debug hex overlay */}
      {!hexagonMode && algorithm === "h3" && showHex && h3HexData.features.length > 0 && (
        <Source type="geojson" data={h3HexData} id="h3-hex-source">
          <Layer {...h3FillLayer} />
          <Layer {...h3OutlineLayer} />
        </Source>
      )}
      {/* Hover heatmap (child cells) */}
      {algorithm === "h3" && hoverHexData.features.length > 0 && !focusedCluster && (
        <Source type="geojson" data={hoverHexData} id="h3-hover-source">
          <Layer {...h3HoverFillLayer} />
          <Layer {...h3HoverOutlineLayer} />
        </Source>
      )}
      {/* Focus mode: persistent hex overlay for clicked cluster */}
      {focusHexData.features.length > 0 && (
        <Source type="geojson" data={focusHexData} id="h3-focus-source">
          <Layer {...h3HoverFillLayer} id="h3-focus-fill" />
          <Layer {...h3HoverOutlineLayer} id="h3-focus-outline" />
        </Source>
      )}
      {/* Focus mode: sub-cell heatmap (large clusters) — rendered below circles */}
      {focusedCluster && focusSubcellHexData.features.length > 0 && (
        <Source type="geojson" data={focusSubcellHexData} id="focus-subcell-source">
          <Layer {...buildH3FillLayerConfig(mapColors, maxCount)} id="focus-subcell-fill" />
          <Layer {...buildH3OutlineLayerConfig(mapColors)} id="focus-subcell-outline" />
        </Source>
      )}
    </>
  );
};

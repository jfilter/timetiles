/**
 * Hook that derives all map layer configs and GeoJSON data for ClusteredMap.
 *
 * Computes the location/cluster layer configurations and the various H3 hex
 * GeoJSON datasets (h3HexData, mergeGroupData, focusHexData, focusSubcellHexData)
 * from animated cluster features and UI state, so ClusteredMap's body stays lean.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { MapColors } from "@timetiles/ui/lib/chart-themes";
import { useMemo } from "react";

import type { ClusterFeature } from "./clustered-map";
import {
  buildClusterLabelLayerConfig,
  buildClusterLayerConfig,
  buildLocationLabelLayerConfig,
  buildLocationLayerConfig,
} from "./clustered-map-helpers";
import {
  buildFocusHexData,
  buildFocusSubcellHexData,
  buildH3HexData,
  buildMergeGroupData,
} from "./clustered-map-hex-data";

interface UseClusterLayersProps {
  algorithm: string;
  animatedClusters: ClusterFeature[];
  mapColors: MapColors;
  maxCount: number;
  highlightedCells: string[] | null | undefined;
  focusedCluster: {
    clusterId: string;
    sourceCells?: string[] | null;
    count: number;
    center: [number, number];
    h3Resolution: number;
  } | null;
  clusterChildren?: ClusterFeature[] | null;
}

export const useClusterLayers = ({
  algorithm,
  animatedClusters,
  mapColors,
  maxCount,
  highlightedCells,
  focusedCluster,
  clusterChildren,
}: UseClusterLayersProps) => {
  const locationFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-location"];
  const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];

  const locationLayer = buildLocationLayerConfig(locationFilter, mapColors, maxCount, highlightedCells);
  const locationLabelLayer = buildLocationLabelLayerConfig(locationFilter, highlightedCells);
  const clusterLayer = buildClusterLayerConfig(clusterFilter, mapColors, maxCount, highlightedCells);
  const clusterLabelLayer = buildClusterLabelLayerConfig(clusterFilter, highlightedCells);

  const h3HexData = useMemo(() => buildH3HexData(algorithm, animatedClusters), [algorithm, animatedClusters]);
  const mergeGroupData = useMemo(() => buildMergeGroupData(algorithm, animatedClusters), [algorithm, animatedClusters]);
  const focusHexData = useMemo(
    () => buildFocusHexData(focusedCluster, algorithm, clusterChildren),
    [focusedCluster, algorithm, clusterChildren]
  );
  const focusSubcellHexData = useMemo(
    () => buildFocusSubcellHexData(focusedCluster, clusterChildren),
    [focusedCluster, clusterChildren]
  );

  return {
    locationLayer,
    locationLabelLayer,
    clusterLayer,
    clusterLabelLayer,
    h3HexData,
    mergeGroupData,
    focusHexData,
    focusSubcellHexData,
  };
};

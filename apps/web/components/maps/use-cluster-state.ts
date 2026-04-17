/**
 * Hook that reads cluster-related UI state and computes animated cluster data.
 *
 * Subscribes to the UI store for algorithm, display mode, filter state and
 * focused cluster, runs the H3/generic transition animations, and returns all
 * derived values needed by ClusteredMap.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMemo } from "react";

import { useUIStore } from "@/lib/store";

import type { ClusterFeature } from "./clustered-map";
import { DEFAULT_CLUSTERS } from "./clustered-map-helpers";
import { useClusterTransition } from "./use-cluster-transition";
import { useH3Transition } from "./use-h3-transition";

export const useClusterState = (clusters: ClusterFeature[]) => {
  const algorithm = useUIStore((s) => s.ui.clusterDensity.clusterAlgorithm ?? "h3");
  const showHex = useUIStore((s) => s.ui.showHexBoundaries);
  const clusterDisplay = useUIStore((s) => s.ui.clusterDisplay);
  const hexagonMode = algorithm === "h3" && clusterDisplay === "hexagons";
  const clusterFilterCells = useUIStore((s) => s.ui.clusterFilterCells);
  const focusedCluster = useUIStore((s) => s.ui.focusedCluster);
  const highlightedCells = focusedCluster
    ? (focusedCluster.sourceCells ?? [focusedCluster.clusterId])
    : clusterFilterCells;

  const h3Animated = useH3Transition(algorithm === "h3" ? clusters : DEFAULT_CLUSTERS);
  const genericAnimated = useClusterTransition(algorithm !== "h3" ? clusters : DEFAULT_CLUSTERS);
  const animatedClusters = algorithm === "h3" ? h3Animated : genericAnimated;
  const geojsonData = { type: "FeatureCollection" as const, features: animatedClusters };
  const maxCount = useMemo(
    () => animatedClusters.reduce((max, f) => Math.max(max, f.properties.count ?? 1), 1),
    [animatedClusters]
  );

  return {
    algorithm,
    showHex,
    hexagonMode,
    clusterFilterCells,
    focusedCluster,
    highlightedCells,
    animatedClusters,
    geojsonData,
    maxCount,
  };
};

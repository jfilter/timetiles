/**
 * H3-specific cluster transition animation.
 *
 * Uses h3-js cellToParent/cellToChildren for exact parent-child matching.
 * When zooming in: children start at parent position and expand outward.
 * When zooming out: children converge to parent position and merge.
 *
 * Only active when clusterAlgorithm === "h3".
 *
 * @module
 * @category Components
 */
"use client";

import { cellToParent, getResolution, isValidCell } from "h3-js";

import type { ClusterFeature } from "./clustered-map";
import type { FeaturePosition } from "./use-transition-animation";
import { useTransitionAnimation } from "./use-transition-animation";

/** Check if an ID is an H3 cell (hex string starting with 8) */
const isH3Id = (id: string): boolean => {
  // H3 cells are 15-char hex strings like "871f18b20ffffff"
  if (id.length < 10 || id.length > 20) return false;
  try {
    return isValidCell(id);
  } catch {
    return false;
  }
};

/**
 * Try to find an ancestor (parent or grandparent) of newId in the old positions map.
 * Returns the ancestor position if found, otherwise undefined.
 */
const findAncestorPosition = (
  newId: string,
  newRes: number,
  oldPositions: Map<string, FeaturePosition>
): FeaturePosition | undefined => {
  if (newRes <= 0) return undefined;
  try {
    const parent = cellToParent(newId, newRes - 1);
    const parentPos = oldPositions.get(parent);
    if (parentPos) return parentPos;

    if (newRes > 1) {
      const grandparent = cellToParent(newId, newRes - 2);
      const gpPos = oldPositions.get(grandparent);
      if (gpPos) return gpPos;
    }
  } catch {
    // Invalid cell, skip
  }
  return undefined;
};

/**
 * Find old cells that are children of newId and compute their centroid position.
 * Returns the centroid position if any children found, otherwise undefined.
 */
const findChildrenCentroid = (
  newId: string,
  newRes: number,
  oldPositions: Map<string, FeaturePosition>
): FeaturePosition | undefined => {
  let sumLng = 0;
  let sumLat = 0;
  let count = 0;
  for (const [oldId, oldPos] of oldPositions) {
    if (!isH3Id(oldId)) continue;
    try {
      const oldRes = getResolution(oldId);
      if (oldRes > newRes && cellToParent(oldId, newRes) === newId) {
        sumLng += oldPos.lng;
        sumLat += oldPos.lat;
        count++;
      }
    } catch {
      // skip
    }
  }
  return count > 0 ? { lng: sumLng / count, lat: sumLat / count } : undefined;
};

/**
 * Match old H3 clusters to new ones using parent-child relationships.
 *
 * Zoom in: old cell at res N → find new cells at res N+1 that are children
 * Zoom out: old cells at res N → find new cell at res N-1 that is parent
 */
const matchH3Clusters = (
  oldPositions: Map<string, FeaturePosition>,
  newPositions: Map<string, FeaturePosition>
): Map<string, FeaturePosition> => {
  const origins = new Map<string, FeaturePosition>();

  for (const [newId] of newPositions) {
    // Direct match (same cell, just panned)
    const direct = oldPositions.get(newId);
    if (direct) {
      origins.set(newId, direct);
      continue;
    }

    if (!isH3Id(newId)) continue;

    const newRes = getResolution(newId);

    // Zoom in: new cell's parent/grandparent should match an old cell
    const ancestorPos = findAncestorPosition(newId, newRes, oldPositions);
    if (ancestorPos) {
      origins.set(newId, ancestorPos);
      continue;
    }

    // Zoom out: new cell is parent of old cells — use centroid of children
    const centroid = findChildrenCentroid(newId, newRes, oldPositions);
    if (centroid) {
      origins.set(newId, centroid);
    }
  }

  return origins;
};

/**
 * H3-specific cluster transition hook.
 *
 * Uses exact H3 parent-child relationships for smooth zoom animations.
 * Children expand from parent position on zoom-in, converge on zoom-out.
 */
export const useH3Transition = (clusters: ClusterFeature[]): ClusterFeature[] =>
  useTransitionAnimation(clusters, matchH3Clusters, { withTransitionScale: true });

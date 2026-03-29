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
import { useCallback, useEffect, useRef, useState } from "react";

import type { ClusterFeature } from "./clustered-map";

const TRANSITION_DURATION = 500;

interface Pos {
  lng: number;
  lat: number;
}

/** Build a map of cluster_id → position from features */
const posMap = (features: ClusterFeature[]): Map<string, Pos> => {
  const m = new Map<string, Pos>();
  for (const f of features) {
    const id = String(f.id ?? "");
    if (id && f.geometry?.coordinates) {
      m.set(id, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    }
  }
  return m;
};

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
 * Match old H3 clusters to new ones using parent-child relationships.
 *
 * Zoom in: old cell at res N → find new cells at res N+1 that are children
 * Zoom out: old cells at res N → find new cell at res N-1 that is parent
 */
const matchH3Clusters = (oldPositions: Map<string, Pos>, newPositions: Map<string, Pos>): Map<string, Pos> => {
  const origins = new Map<string, Pos>();

  for (const [newId] of newPositions) {
    // Direct match (same cell, just panned)
    const direct = oldPositions.get(newId);
    if (direct) {
      origins.set(newId, direct);
      continue;
    }

    if (!isH3Id(newId)) continue;

    const newRes = getResolution(newId);

    // Zoom in: new cell's parent should match an old cell
    // e.g. new "871f18b20ffffff" (res7) → parent "861f18b2fffffff" (res6)
    if (newRes > 0) {
      try {
        const parent = cellToParent(newId, newRes - 1);
        const parentPos = oldPositions.get(parent);
        if (parentPos) {
          origins.set(newId, parentPos);
          continue;
        }

        // Try grandparent (2 zoom levels = 1 resolution step skipped)
        if (newRes > 1) {
          const grandparent = cellToParent(newId, newRes - 2);
          const gpPos = oldPositions.get(grandparent);
          if (gpPos) {
            origins.set(newId, gpPos);
            continue;
          }
        }
      } catch {
        // Invalid cell, skip
      }
    }

    // Zoom out: new cell is parent of old cells
    // Find old cells that have this new cell as parent
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const [oldId, oldPos] of oldPositions) {
      if (!isH3Id(oldId)) continue;
      try {
        const oldRes = getResolution(oldId);
        if (oldRes > newRes) {
          const oldParent = cellToParent(oldId, newRes);
          if (oldParent === newId) {
            sumLng += oldPos.lng;
            sumLat += oldPos.lat;
            count++;
          }
        }
      } catch {
        // skip
      }
    }
    if (count > 0) {
      origins.set(newId, { lng: sumLng / count, lat: sumLat / count });
      continue;
    }

    // No fallback — only animate exact H3 parent-child matches
  }

  return origins;
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** Interpolate features: position + scale (for size animation) */
const interpolate = (features: ClusterFeature[], origins: Map<string, Pos>, progress: number): ClusterFeature[] => {
  if (progress >= 1 || origins.size === 0) return features;
  const eased = easeOutCubic(progress);

  return features.map((f) => {
    const id = String(f.id ?? "");
    const origin = origins.get(id);
    if (!origin) return f;

    const [tLng, tLat] = f.geometry.coordinates;
    const lng = origin.lng + (tLng - origin.lng) * eased;
    const lat = origin.lat + (tLat - origin.lat) * eased;

    return {
      ...f,
      geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] },
      properties: {
        ...f.properties,
        // Scale from 0 to 1 during transition (MapLibre can use this)
        transitionScale: eased,
      },
    };
  });
};

/**
 * H3-specific cluster transition hook.
 *
 * Uses exact H3 parent-child relationships for smooth zoom animations.
 * Children expand from parent position on zoom-in, converge on zoom-out.
 */
export const useH3Transition = (clusters: ClusterFeature[]): ClusterFeature[] => {
  const [animated, setAnimated] = useState<ClusterFeature[]>(clusters);
  const prevRef = useRef<ClusterFeature[]>([]);
  const animRef = useRef<number | null>(null);

  const doAnimate = useCallback((start: number, target: ClusterFeature[], origins: Map<string, Pos>) => {
    const elapsed = performance.now() - start;
    const progress = Math.min(elapsed / TRANSITION_DURATION, 1);
    setAnimated(interpolate(target, origins, progress));

    if (progress < 1) {
      animRef.current = requestAnimationFrame(() => doAnimate(start, target, origins));
    } else {
      animRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }

    const prev = prevRef.current;
    prevRef.current = clusters;

    if (prev.length === 0 || clusters.length === 0) {
      setAnimated(clusters);
      return;
    }

    const oldPos = posMap(prev);
    const newPos = posMap(clusters);
    const origins = matchH3Clusters(oldPos, newPos);

    if (origins.size === 0) {
      setAnimated(clusters);
      return;
    }

    const start = performance.now();
    animRef.current = requestAnimationFrame(() => doAnimate(start, clusters, origins));

    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [clusters, doAnimate]);

  return animated;
};

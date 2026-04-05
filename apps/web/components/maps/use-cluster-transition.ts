/**
 * Hook that animates cluster transitions when zoom changes.
 *
 * Uses geohash-based cluster IDs to match old→new clusters:
 * - Zoom in: parent cluster splits into children (prefix match)
 * - Zoom out: children merge into parent cluster
 *
 * During the 300ms transition, intermediate positions are interpolated
 * so clusters visually move from their old position to their new one.
 *
 * @module
 * @category Components
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { createLogger } from "@/lib/logger";

import type { ClusterFeature } from "./clustered-map";

const logger = createLogger("ClusterTransition");

const TRANSITION_DURATION = 500; // ms

interface FeaturePosition {
  lng: number;
  lat: number;
  id: string;
}

/** Extract position map from features (cluster_id → [lng, lat]) */
const buildPositionMap = (features: ClusterFeature[]): Map<string, FeaturePosition> => {
  const map = new Map<string, FeaturePosition>();
  for (const f of features) {
    const id = String(f.id ?? "");
    if (id && f.geometry?.coordinates) {
      map.set(id, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], id });
    }
  }
  return map;
};

/** Extract geohash part from cluster ID (strip ":N" merge suffix if present) */
const geopart = (id: string): string => {
  const colonIdx = id.indexOf(":");
  return colonIdx >= 0 ? id.substring(0, colonIdx) : id;
};

/**
 * Match old clusters to new clusters via geohash prefix.
 *
 * Uses the geohash portion of the ID (before ":") for prefix matching.
 * Merge clusters have IDs like "u33dc:0" — the ":0" is stripped for matching.
 *
 * Zoom in: old "u33d" → new "u33dc", "u33dc:0" (old geo is prefix of new geo)
 * Zoom out: old "u33dc:0", "u33de" → new "u33d" (new geo is prefix of old geo)
 * No fallback — unmatched clusters appear instantly at final position.
 */
const matchClusters = (
  oldPositions: Map<string, FeaturePosition>,
  newPositions: Map<string, FeaturePosition>
): Map<string, FeaturePosition> => {
  const origins = new Map<string, FeaturePosition>();

  for (const [newId] of newPositions) {
    const newGeo = geopart(newId);

    // Direct match (same ID)
    const direct = oldPositions.get(newId);
    if (direct) {
      origins.set(newId, direct);
      continue;
    }

    // Zoom in: find old parent (old geohash is prefix of new geohash)
    let bestMatch: FeaturePosition | null = null;
    let bestLen = 0;
    for (const [oldId, oldPos] of oldPositions) {
      const oldGeo = geopart(oldId);
      if (newGeo.startsWith(oldGeo) && oldGeo.length > bestLen) {
        bestMatch = oldPos;
        bestLen = oldGeo.length;
      }
    }
    if (bestMatch) {
      origins.set(newId, bestMatch);
      continue;
    }

    // Zoom out: find old children (new geohash is prefix of old geohashes)
    let sumLng = 0;
    let sumLat = 0;
    let count = 0;
    for (const [oldId, oldPos] of oldPositions) {
      const oldGeo = geopart(oldId);
      if (oldGeo.startsWith(newGeo)) {
        sumLng += oldPos.lng;
        sumLat += oldPos.lat;
        count++;
      }
    }
    if (count > 0) {
      origins.set(newId, { lng: sumLng / count, lat: sumLat / count, id: newId });
    }
    // No fallback — only animate exact prefix matches
  }

  return origins;
};

/** Interpolate features from origin positions to target positions */
const interpolateFeatures = (
  features: ClusterFeature[],
  origins: Map<string, FeaturePosition>,
  progress: number // 0 = at origin, 1 = at target
): ClusterFeature[] => {
  if (progress >= 1 || origins.size === 0) return features;

  const eased = easeOutCubic(progress);

  return features.map((f) => {
    const id = String(f.id ?? "");
    const origin = origins.get(id);
    if (!origin) return f;

    const targetLng = f.geometry.coordinates[0];
    const targetLat = f.geometry.coordinates[1];
    const lng = origin.lng + (targetLng - origin.lng) * eased;
    const lat = origin.lat + (targetLat - origin.lat) * eased;

    return { ...f, geometry: { ...f.geometry, coordinates: [lng, lat] as [number, number] } };
  });
};

/** Cubic ease-out: fast start, smooth deceleration */
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Hook that returns animated cluster features with smooth transitions.
 *
 * @param clusters - The current (target) cluster features from the API
 * @returns Animated cluster features with interpolated positions during transitions
 */
export const useClusterTransition = (clusters: ClusterFeature[]): ClusterFeature[] => {
  const [animatedClusters, setAnimatedClusters] = useState<ClusterFeature[]>(clusters);
  const prevClustersRef = useRef<ClusterFeature[]>([]);
  const animationRef = useRef<number | null>(null);
  const originsRef = useRef<Map<string, FeaturePosition>>(new Map());

  const animate = useCallback(
    (startTime: number, targetFeatures: ClusterFeature[], origins: Map<string, FeaturePosition>) => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / TRANSITION_DURATION, 1);

      const interpolated = interpolateFeatures(targetFeatures, origins, progress);
      setAnimatedClusters(interpolated);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(() => animate(startTime, targetFeatures, origins));
      } else {
        animationRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    // Cancel any running animation
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const prev = prevClustersRef.current;
    prevClustersRef.current = clusters;

    // Skip animation if no previous data or empty
    if (prev.length === 0 || clusters.length === 0) {
      setAnimatedClusters(clusters);
      return;
    }

    // Build position maps and find matches
    const oldPositions = buildPositionMap(prev);
    const newPositions = buildPositionMap(clusters);
    const origins = matchClusters(oldPositions, newPositions);

    // Skip animation if no matches found (completely different data)
    if (origins.size === 0) {
      logger.debug("No matches found, skipping animation", { oldCount: prev.length, newCount: clusters.length });
      setAnimatedClusters(clusters);
      return;
    }

    logger.debug("Animating cluster transition", {
      oldCount: prev.length,
      newCount: clusters.length,
      matches: origins.size,
      sampleIds: [...origins.keys()].slice(0, 3),
    });

    originsRef.current = origins;
    const startTime = performance.now();
    animationRef.current = requestAnimationFrame(() => animate(startTime, clusters, origins));

    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [clusters, animate]);

  return animatedClusters;
};

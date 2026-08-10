/**
 * Shared animation machinery for cluster transitions.
 *
 * Holds the parts that do not depend on the clustering algorithm: building the
 * position maps, running the requestAnimationFrame loop and interpolating
 * positions. The algorithm-specific part is the `matchOrigins` callback that
 * decides which old cluster a new cluster animates out of.
 *
 * @module
 * @category Components
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ClusterFeature } from "./clustered-map";

export const TRANSITION_DURATION = 500; // ms

export interface FeaturePosition {
  lng: number;
  lat: number;
}

/** Maps every new cluster id to the position it should animate out of. */
export type MatchOrigins = (
  oldPositions: Map<string, FeaturePosition>,
  newPositions: Map<string, FeaturePosition>
) => Map<string, FeaturePosition>;

interface TransitionOptions {
  /** Expose the eased progress as `properties.transitionScale` for size animation. */
  withTransitionScale?: boolean;
  /** Called when a transition starts, for diagnostics. */
  onTransition?: (info: { oldCount: number; newCount: number; origins: Map<string, FeaturePosition> }) => void;
  /** Called when no origins matched and the update is applied instantly. */
  onSkip?: (info: { oldCount: number; newCount: number }) => void;
}

/** Extract position map from features (cluster id → position) */
export const buildPositionMap = (features: ClusterFeature[]): Map<string, FeaturePosition> => {
  const map = new Map<string, FeaturePosition>();
  for (const f of features) {
    const id = String(f.id ?? "");
    if (id && f.geometry?.coordinates) {
      map.set(id, { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] });
    }
  }
  return map;
};

/** Cubic ease-out: fast start, smooth deceleration */
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

const interpolateFeatures = (
  features: ClusterFeature[],
  origins: Map<string, FeaturePosition>,
  progress: number, // 0 = at origin, 1 = at target
  withTransitionScale: boolean
): ClusterFeature[] => {
  if (progress >= 1 || origins.size === 0) return features;

  const eased = easeOutCubic(progress);

  return features.map((f) => {
    const id = String(f.id ?? "");
    const origin = origins.get(id);
    if (!origin) return f;

    const [targetLng, targetLat] = f.geometry.coordinates;
    const lng = origin.lng + (targetLng - origin.lng) * eased;
    const lat = origin.lat + (targetLat - origin.lat) * eased;

    const geometry = { ...f.geometry, coordinates: [lng, lat] as [number, number] };
    return withTransitionScale
      ? { ...f, geometry, properties: { ...f.properties, transitionScale: eased } }
      : { ...f, geometry };
  });
};

/**
 * Animate cluster features from their previous positions to the current ones.
 *
 * @param clusters - The current (target) cluster features from the API
 * @param matchOrigins - Algorithm-specific old→new matching
 * @returns Animated cluster features with interpolated positions during transitions
 */
export const useTransitionAnimation = (
  clusters: ClusterFeature[],
  matchOrigins: MatchOrigins,
  options: TransitionOptions = {}
): ClusterFeature[] => {
  const { withTransitionScale = false, onTransition, onSkip } = options;
  const [animated, setAnimated] = useState<ClusterFeature[]>(clusters);
  const prevRef = useRef<ClusterFeature[]>([]);
  const animationRef = useRef<number | null>(null);

  const animate = useCallback(
    (startTime: number, target: ClusterFeature[], origins: Map<string, FeaturePosition>) => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / TRANSITION_DURATION, 1);

      setAnimated(interpolateFeatures(target, origins, progress, withTransitionScale));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(() => animate(startTime, target, origins));
      } else {
        animationRef.current = null;
      }
    },
    [withTransitionScale]
  );

  useEffect(() => {
    // Cancel any running animation
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    const prev = prevRef.current;
    prevRef.current = clusters;

    // Skip animation if no previous data or empty
    if (prev.length === 0 || clusters.length === 0) {
      setAnimated(clusters);
      return;
    }

    const origins = matchOrigins(buildPositionMap(prev), buildPositionMap(clusters));

    // Skip animation if no matches found (completely different data)
    if (origins.size === 0) {
      onSkip?.({ oldCount: prev.length, newCount: clusters.length });
      setAnimated(clusters);
      return;
    }

    onTransition?.({ oldCount: prev.length, newCount: clusters.length, origins });

    const startTime = performance.now();
    animationRef.current = requestAnimationFrame(() => animate(startTime, clusters, origins));

    return () => {
      if (animationRef.current != null) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [clusters, animate, matchOrigins, onTransition, onSkip]);

  return animated;
};

/**
 * Hook that animates cluster transitions when zoom changes.
 *
 * Uses geohash-based cluster IDs to match old→new clusters:
 * - Zoom in: parent cluster splits into children (prefix match)
 * - Zoom out: children merge into parent cluster
 *
 * During the transition, intermediate positions are interpolated
 * so clusters visually move from their old position to their new one.
 *
 * @module
 * @category Components
 */
import { createLogger } from "@/lib/logger";

import type { ClusterFeature } from "./clustered-map";
import type { FeaturePosition } from "./use-transition-animation";
import { useTransitionAnimation } from "./use-transition-animation";

const logger = createLogger("ClusterTransition");

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
      origins.set(newId, { lng: sumLng / count, lat: sumLat / count });
    }
    // No fallback — only animate exact prefix matches
  }

  return origins;
};

const logSkip = ({ oldCount, newCount }: { oldCount: number; newCount: number }): void => {
  logger.debug("No matches found, skipping animation", { oldCount, newCount });
};

const logTransition = ({
  oldCount,
  newCount,
  origins,
}: {
  oldCount: number;
  newCount: number;
  origins: Map<string, FeaturePosition>;
}): void => {
  logger.debug("Animating cluster transition", {
    oldCount,
    newCount,
    matches: origins.size,
    sampleIds: [...origins.keys()].slice(0, 3),
  });
};

/**
 * Hook that returns animated cluster features with smooth transitions.
 *
 * @param clusters - The current (target) cluster features from the API
 * @returns Animated cluster features with interpolated positions during transitions
 */
export const useClusterTransition = (clusters: ClusterFeature[]): ClusterFeature[] =>
  useTransitionAnimation(clusters, matchClusters, { onTransition: logTransition, onSkip: logSkip });

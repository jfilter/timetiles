/**
 * Map panel combining ClusteredMap with a zoom-to-data button.
 *
 * Shared between map-explorer and list-explorer desktop/mobile layouts.
 *
 * @module
 * @category Components
 */
import type { LngLatBounds } from "maplibre-gl";
import type { RefObject } from "react";

import type { ClusterFeature } from "@/components/maps/clustered-map";
import { ClusteredMap, type ClusteredMapHandle, type MapViewState } from "@/components/maps/clustered-map";
import { ZoomToDataButton } from "@/components/maps/zoom-to-data-button";
import type { ClusterStats } from "@/lib/constants/map";
import type { SimpleBounds } from "@/lib/utils/event-params";

interface MapPanelProps {
  mapRef?: RefObject<ClusteredMapHandle | null>;
  clusters: ClusterFeature[];
  clusterStats?: ClusterStats;
  onBoundsChange: (bounds: LngLatBounds, zoom: number, center?: { lng: number; lat: number }) => void;
  initialBounds?: SimpleBounds | null;
  initialViewState?: MapViewState | null;
  isLoadingBounds: boolean;
  showZoomToData: boolean;
  onZoomToData: () => void;
  className?: string;
}

export const MapPanel = ({
  mapRef,
  clusters,
  clusterStats,
  onBoundsChange,
  initialBounds,
  initialViewState,
  isLoadingBounds,
  showZoomToData,
  onZoomToData,
  className,
}: MapPanelProps) => (
  <div className={className ?? "relative h-full"}>
    <ClusteredMap
      ref={mapRef}
      clusters={clusters}
      clusterStats={clusterStats}
      onBoundsChange={onBoundsChange}
      initialBounds={initialBounds}
      initialViewState={initialViewState}
      isLoadingBounds={isLoadingBounds}
    />
    <div className="absolute bottom-12 left-2 z-10">
      <ZoomToDataButton visible={showZoomToData} onClick={onZoomToData} />
    </div>
  </div>
);

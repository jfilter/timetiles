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

import { ClusterDensityControl } from "@/components/maps/cluster-density-control";
import type { ClusterFeature } from "@/components/maps/clustered-map";
import { ClusteredMap, type ClusteredMapHandle, type MapViewState } from "@/components/maps/clustered-map";
import { ZoomToDataButton } from "@/components/maps/zoom-to-data-button";
import type { ClusterSummaryResponse } from "@/lib/schemas/events";
import type { SimpleBounds } from "@/lib/utils/event-params";

interface MapPanelProps {
  mapRef?: RefObject<ClusteredMapHandle | null>;
  clusters: ClusterFeature[];
  clusterChildren?: ClusterFeature[] | null;
  clusterSummary?: ClusterSummaryResponse;
  clusterSummaryLoading?: boolean;
  onBoundsChange: (bounds: LngLatBounds, zoom: number, center?: { lng: number; lat: number }) => void;
  onEventClick?: (eventId: number) => void;
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
  clusterChildren,
  clusterSummary,
  clusterSummaryLoading,
  onBoundsChange,
  onEventClick,
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
      clusterChildren={clusterChildren}
      clusterSummary={clusterSummary}
      clusterSummaryLoading={clusterSummaryLoading}
      onBoundsChange={onBoundsChange}
      onEventClick={onEventClick}
      initialBounds={initialBounds}
      initialViewState={initialViewState}
      isLoadingBounds={isLoadingBounds}
    />
    <div className="absolute bottom-20 left-2 z-10 flex flex-col gap-1.5">
      <ClusterDensityControl />
      <ZoomToDataButton visible={showZoomToData} onClick={onZoomToData} />
    </div>
  </div>
);

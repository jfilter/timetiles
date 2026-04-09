/**
 * Overlay panels rendered on top of the ClusteredMap canvas.
 *
 * Renders the ClusterFocusPanel (when a cluster is focused) and the
 * cluster-filter active indicator (when a filter is applied), keeping
 * ClusteredMap's render function concise.
 *
 * @module
 * @category Components
 */
"use client";

import { X } from "lucide-react";

import type { ClusterSummaryResponse } from "@/lib/schemas/events";
import { useUIStore } from "@/lib/store";

import { ClusterFocusPanel } from "./cluster-focus-panel";

interface FocusedCluster {
  clusterId: string;
  count: number;
  sourceCells?: string[] | null;
  center: [number, number];
  h3Resolution: number;
}

interface MapClusterOverlaysProps {
  focusedCluster: FocusedCluster | null;
  clusterSummary?: ClusterSummaryResponse;
  clusterSummaryLoading?: boolean;
  clusterFilterCells: string[] | null;
  onZoomIn: () => void;
  onClose: () => void;
  filterLabel: string;
}

export const MapClusterOverlays = ({
  focusedCluster,
  clusterSummary,
  clusterSummaryLoading,
  clusterFilterCells,
  onZoomIn,
  onClose,
  filterLabel,
}: MapClusterOverlaysProps) => (
  <>
    {focusedCluster && (
      <div className="absolute right-14 bottom-20 z-10">
        <ClusterFocusPanel
          count={focusedCluster.count}
          summary={clusterSummary}
          isLoading={clusterSummaryLoading ?? false}
          onZoomIn={onZoomIn}
          onFilterToCluster={() => {
            const cells = focusedCluster.sourceCells ?? [focusedCluster.clusterId];
            useUIStore.getState().setClusterFilterCells(cells);
            onClose();
          }}
          onClose={onClose}
        />
      </div>
    )}
    {clusterFilterCells && (
      <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2">
        <div className="bg-primary/90 text-primary-foreground flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm">
          <span>{filterLabel}</span>
          <button
            type="button"
            onClick={() => useUIStore.getState().setClusterFilterCells(null)}
            className="hover:bg-primary-foreground/20 rounded-full p-0.5 transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
    )}
  </>
);

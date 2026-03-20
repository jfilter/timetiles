/**
 * Shared hook for map position initialization in explorer views.
 *
 * Encapsulates the pattern of reading map position from URL params,
 * computing the initial view state, and providing the position change
 * handler for ExplorerShell.
 *
 * @module
 * @category Components
 */
import { useCallback } from "react";

import { useMapPosition } from "@/lib/hooks/use-filters";

import { getInitialViewState } from "./explorer-helpers";

export const useExplorerMapPosition = () => {
  const { mapPosition, hasMapPosition, setMapPosition } = useMapPosition();

  const handleMapPositionChange = useCallback(
    (center: { lng: number; lat: number }, zoom: number) => {
      setMapPosition({ latitude: center.lat, longitude: center.lng, zoom });
    },
    [setMapPosition]
  );

  const initialViewState = getInitialViewState(hasMapPosition, mapPosition);

  return {
    mapPosition,
    hasMapPosition,
    initialViewState,
    explorerOptions: { onMapPositionChange: handleMapPositionChange },
  };
};

// @vitest-environment jsdom
/**
 * Unit tests for the initial map positioning in useMapBounds.
 *
 * @module
 * @category Unit Tests
 */
import { act, renderHook } from "@testing-library/react";
import type { MapRef } from "react-map-gl/maplibre";
import { describe, expect, it, vi } from "vitest";

import { useMapBounds } from "@/components/maps/use-map-bounds";

const createMap = () => {
  const bounds = { getNorth: () => 41, getSouth: () => 40, getEast: () => -73, getWest: () => -74 };
  return {
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    getBounds: () => bounds,
    getZoom: () => 8,
    getCenter: () => ({ lng: -73.5, lat: 40.5 }),
  };
};

const asMapRef = (map: ReturnType<typeof createMap>) => map as unknown as MapRef;

const viewState = { latitude: 40.5, longitude: -73.5, zoom: 8 };

describe("useMapBounds", () => {
  it("does not reposition on load a map the URL view state already positioned", () => {
    const map = createMap();
    const mapRef = { current: asMapRef(map) };
    const { result } = renderHook(() =>
      useMapBounds({ initialViewState: viewState, mapRef, setCurrentZoom: vi.fn(), onBoundsChange: vi.fn() })
    );
    expect(map.flyTo).toHaveBeenCalledTimes(1);

    act(() => result.current.handleLoad({ target: asMapRef(map) }));

    expect(map.flyTo).toHaveBeenCalledTimes(1);
  });

  it("positions the map on load when it could not be positioned earlier", () => {
    const map = createMap();
    const mapRef = { current: null as MapRef | null };
    const onBoundsChange = vi.fn();
    const { result } = renderHook(() =>
      useMapBounds({ initialViewState: viewState, mapRef, setCurrentZoom: vi.fn(), onBoundsChange })
    );
    expect(map.flyTo).not.toHaveBeenCalled();

    act(() => result.current.handleLoad({ target: asMapRef(map) }));

    expect(map.flyTo).toHaveBeenCalledWith({ center: [-73.5, 40.5], zoom: 8, animate: false });
    expect(onBoundsChange).toHaveBeenCalledWith(map.getBounds(), 8, { lng: -73.5, lat: 40.5 }, false);
  });
});

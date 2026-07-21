// @vitest-environment jsdom
/**
 * Regression test for the H3 hover listener attachment.
 *
 * The native `mousemove` listener used to be gated on `isMapPositioned`, which
 * starts `true` whenever the explore URL carries lat/lng/zoom. On that path the
 * effect ran once on mount — before react-map-gl had published the map instance
 * on the ref — bailed out, and never re-ran (its deps never changed). Result:
 * no hover listener at all for anyone opening a shared map permalink.
 *
 * @module
 * @category Unit Tests
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { describe, expect, it, vi } from "vitest";

import { useH3Hover } from "@/components/maps/use-h3-hover";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const createFakeMap = () => ({
  on: vi.fn(),
  off: vi.fn(),
  getLayer: vi.fn(() => ({})),
  getBounds: () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 }),
  queryRenderedFeatures: vi.fn(() => []),
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useH3Hover mousemove listener", () => {
  it("attaches once the map instance appears, even when the map is positioned from the URL", () => {
    const fakeMap = createFakeMap();
    // react-map-gl publishes the imperative handle only after it has created
    // the underlying maplibre map, so the ref is empty on the first commit.
    const mapRef: React.RefObject<MapRef | null> = { current: null };

    const { rerender } = renderHook(
      // `isMapLoaded` mirrors the map's `load` event: false on mount, true once
      // maplibre is ready. `lat/lng/zoom` in the URL does not change that.
      ({ isMapLoaded }: { isMapLoaded: boolean }) =>
        useH3Hover({ algorithm: "h3", currentZoom: 8, mapRef, isMapLoaded }),
      { wrapper: createWrapper(), initialProps: { isMapLoaded: false } }
    );

    expect(fakeMap.on).not.toHaveBeenCalled();

    mapRef.current = { getMap: () => fakeMap } as unknown as MapRef;
    rerender({ isMapLoaded: true });

    expect(fakeMap.on).toHaveBeenCalledWith("mousemove", expect.any(Function));
  });

  it("detaches the listener on unmount", () => {
    const fakeMap = createFakeMap();
    const mapRef = { current: { getMap: () => fakeMap } as unknown as MapRef };

    const { unmount } = renderHook(() => useH3Hover({ algorithm: "h3", currentZoom: 8, mapRef, isMapLoaded: true }), {
      wrapper: createWrapper(),
    });

    expect(fakeMap.on).toHaveBeenCalledWith("mousemove", expect.any(Function));
    unmount();
    expect(fakeMap.off).toHaveBeenCalledWith("mousemove", expect.any(Function));
  });
});

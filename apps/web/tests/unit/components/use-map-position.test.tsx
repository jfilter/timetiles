/**
 * Tests for useMapPosition hook.
 *
 * @module
 * @category Tests
 */
import { useMapPosition } from "@/lib/hooks/use-filters";
import { useUIStore } from "@/lib/store";

import { act, renderWithProviders, waitFor } from "../../setup/unit/react-render";

/**
 * Test component that exposes the useMapPosition hook state.
 */
const MapPositionTestComponent = ({
  onStateChange,
}: {
  onStateChange: (state: ReturnType<typeof useMapPosition>) => void;
}) => {
  const state = useMapPosition();

  // Call onStateChange whenever state changes
  onStateChange(state);

  return (
    <div data-testid="map-position">
      <span data-testid="lat">{state.mapPosition.latitude ?? "null"}</span>
      <span data-testid="lng">{state.mapPosition.longitude ?? "null"}</span>
      <span data-testid="zoom">{state.mapPosition.zoom ?? "null"}</span>
      <span data-testid="has-position">{state.hasMapPosition ? "true" : "false"}</span>
      <button
        data-testid="set-position"
        onClick={() => state.setMapPosition({ latitude: 51.5074, longitude: -0.1278, zoom: 10 })}
      >
        Set London
      </button>
      <button data-testid="clear-position" onClick={() => state.clearMapPosition()}>
        Clear
      </button>
    </div>
  );
};

describe("useMapPosition", () => {
  test("returns null values when no URL params are set", () => {
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />);

    expect(capturedState).not.toBeNull();
    expect(capturedState!.mapPosition.latitude).toBeNull();
    expect(capturedState!.mapPosition.longitude).toBeNull();
    expect(capturedState!.mapPosition.zoom).toBeNull();
    expect(capturedState!.hasMapPosition).toBe(false);
  });

  test("parses lat/lng/zoom from URL params", () => {
    const searchParams = new URLSearchParams("lat=40.7128&lng=-74.006&zoom=12");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, { searchParams });

    expect(capturedState).not.toBeNull();
    expect(capturedState!.mapPosition.latitude).toBe(40.7128);
    expect(capturedState!.mapPosition.longitude).toBe(-74.006);
    expect(capturedState!.mapPosition.zoom).toBe(12);
    expect(capturedState!.hasMapPosition).toBe(true);
  });

  test("hasMapPosition is false when only some params are set", () => {
    // Only lat and lng, no zoom
    const searchParams = new URLSearchParams("lat=40.7128&lng=-74.006");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, { searchParams });

    expect(capturedState).not.toBeNull();
    expect(capturedState!.mapPosition.latitude).toBe(40.7128);
    expect(capturedState!.mapPosition.longitude).toBe(-74.006);
    expect(capturedState!.mapPosition.zoom).toBeNull();
    expect(capturedState!.hasMapPosition).toBe(false);
  });

  test("setMapPosition stores rounded values and clearMapPosition removes them", async () => {
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />);

    act(() => capturedState!.setMapPosition({ latitude: 51.50741, longitude: -0.12784, zoom: 10.26 }));

    await waitFor(() => expect(capturedState!.hasMapPosition).toBe(true));
    expect(capturedState!.mapPosition).toEqual({ latitude: 51.5074, longitude: -0.1278, zoom: 10.3 });

    act(() => capturedState!.clearMapPosition());

    await waitFor(() => expect(capturedState!.hasMapPosition).toBe(false));
    expect(capturedState!.mapPosition).toEqual({ latitude: null, longitude: null, zoom: null });
  });

  test("setMapPosition leaves the URL alone when the rounded position is unchanged", async () => {
    // The URL spells lng with a trailing zero; the map settling there must not rewrite it.
    const searchParams = new URLSearchParams("lat=48.1351&lng=11.5820&zoom=10");
    const onUrlUpdate = vi.fn();
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
      onUrlUpdate,
    });

    await act(async () => {
      capturedState!.setMapPosition({ latitude: 48.135_100_3, longitude: 11.581_999_8, zoom: 10.02 });
      // Longer than nuqs' URL update throttle, so a write would have flushed by now
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(onUrlUpdate).not.toHaveBeenCalled();

    act(() => capturedState!.setMapPosition({ latitude: 48.2, longitude: 11.582, zoom: 10 }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    expect(onUrlUpdate.mock.calls[0]![0].queryString).toBe("?lat=48.2&lng=11.582&zoom=10");
  });

  test("setMapPosition holds the position for a pending view switch instead of writing the URL", async () => {
    const searchParams = new URLSearchParams("lat=48.1351&lng=11.582&zoom=10");
    const onUrlUpdate = vi.fn();
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
      onUrlUpdate,
    });

    useUIStore.getState().startViewSwitch("/explore/list");
    try {
      await act(async () => {
        capturedState!.setMapPosition({ latitude: 52.520_01, longitude: 13.405_04, zoom: 10.04 });
        // Longer than nuqs' URL update throttle, so a write would have flushed by now
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      expect(onUrlUpdate).not.toHaveBeenCalled();
      expect(useUIStore.getState().ui.viewSwitch).toEqual({
        path: "/explore/list",
        heldPosition: { lat: 52.52, lng: 13.405, zoom: 10 },
      });
    } finally {
      useUIStore.getState().endViewSwitch();
    }

    act(() => capturedState!.setMapPosition({ latitude: 52.52, longitude: 13.405, zoom: 10 }));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    expect(onUrlUpdate.mock.calls[0]![0].queryString).toBe("?lat=52.52&lng=13.405&zoom=10");
  });

  test("holdMapPosition is a no-op without a pending view switch", () => {
    useUIStore.getState().holdMapPosition({ lat: 1, lng: 2, zoom: 3 });
    expect(useUIStore.getState().ui.viewSwitch).toBeNull();
  });

  test("setMapPosition back to the URL position overrides a write still queued", async () => {
    const searchParams = new URLSearchParams("lat=48.1351&lng=11.582&zoom=10");
    const onUrlUpdate = vi.fn();
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
      onUrlUpdate,
    });

    // Both calls see the same render, as two map events firing back to back do.
    const { setMapPosition } = capturedState!;
    act(() => {
      setMapPosition({ latitude: 48.2, longitude: 11.7, zoom: 10 });
      setMapPosition({ latitude: 48.1351, longitude: 11.582, zoom: 10 });
    });

    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.lastCall![0].queryString).toBe("?lat=48.1351&lng=11.582&zoom=10");
    expect(capturedState!.mapPosition).toEqual({ latitude: 48.1351, longitude: 11.582, zoom: 10 });
  });

  test("handles decimal zoom values correctly", () => {
    const searchParams = new URLSearchParams("lat=40.7128&lng=-74.006&zoom=12.5");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, { searchParams });

    expect(capturedState!.mapPosition.zoom).toBe(12.5);
    expect(capturedState!.hasMapPosition).toBe(true);
  });

  test("handles negative coordinates (Western/Southern hemisphere)", () => {
    const searchParams = new URLSearchParams("lat=-33.8688&lng=151.2093&zoom=10");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, { searchParams });

    // Sydney, Australia coordinates
    expect(capturedState!.mapPosition.latitude).toBe(-33.8688);
    expect(capturedState!.mapPosition.longitude).toBe(151.2093);
    expect(capturedState!.hasMapPosition).toBe(true);
  });
});

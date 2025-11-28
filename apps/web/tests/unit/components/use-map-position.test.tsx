/**
 * Tests for useMapPosition hook.
 *
 * @module
 * @category Tests
 */
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

import { useMapPosition } from "@/lib/filters";

import { renderWithProviders } from "../../setup/unit/react-render";

// Ensure DOM cleanup between tests
beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

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

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
    });

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

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
    });

    expect(capturedState).not.toBeNull();
    expect(capturedState!.mapPosition.latitude).toBe(40.7128);
    expect(capturedState!.mapPosition.longitude).toBe(-74.006);
    expect(capturedState!.mapPosition.zoom).toBeNull();
    expect(capturedState!.hasMapPosition).toBe(false);
  });

  test("setMapPosition and clearMapPosition functions are callable", () => {
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />);

    expect(capturedState).not.toBeNull();
    expect(capturedState!.hasMapPosition).toBe(false);

    // Verify both functions exist and are callable
    expect(typeof capturedState!.setMapPosition).toBe("function");
    expect(typeof capturedState!.clearMapPosition).toBe("function");
    expect(capturedState!.setMapPosition).toBeDefined();
    expect(capturedState!.clearMapPosition).toBeDefined();
  });

  test("handles decimal zoom values correctly", () => {
    const searchParams = new URLSearchParams("lat=40.7128&lng=-74.006&zoom=12.5");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
    });

    expect(capturedState!.mapPosition.zoom).toBe(12.5);
    expect(capturedState!.hasMapPosition).toBe(true);
  });

  test("handles negative coordinates (Western/Southern hemisphere)", () => {
    const searchParams = new URLSearchParams("lat=-33.8688&lng=151.2093&zoom=10");
    let capturedState: ReturnType<typeof useMapPosition> | null = null;

    renderWithProviders(<MapPositionTestComponent onStateChange={(s) => (capturedState = s)} />, {
      searchParams,
    });

    // Sydney, Australia coordinates
    expect(capturedState!.mapPosition.latitude).toBe(-33.8688);
    expect(capturedState!.mapPosition.longitude).toBe(151.2093);
    expect(capturedState!.hasMapPosition).toBe(true);
  });
});

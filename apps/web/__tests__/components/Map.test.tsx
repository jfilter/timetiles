import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "../test-utils";
import { Map } from "@/components/Map";

// Mock maplibre-gl with minimal functionality for testing
const mockOnBoundsChange = vi.fn();
const mockMapInstance = {
  on: vi.fn(),
  remove: vi.fn(),
  getBounds: vi.fn(() => ({
    getWest: () => -180,
    getEast: () => 180,
    getSouth: () => -90,
    getNorth: () => 90,
  })),
  fitBounds: vi.fn(),
  addControl: vi.fn(),
};

const mockMarkers = new Set();
const mockMarkerInstance = {
  setLngLat: vi.fn().mockReturnThis(),
  setPopup: vi.fn().mockReturnThis(),
  addTo: vi.fn((map) => {
    mockMarkers.add(mockMarkerInstance);
    return mockMarkerInstance;
  }),
  remove: vi.fn(() => {
    mockMarkers.delete(mockMarkerInstance);
    return mockMarkerInstance;
  }),
  getElement: vi.fn(() => document.createElement("div")),
};

vi.mock("maplibre-gl", () => ({
  default: {
    Map: vi.fn(() => mockMapInstance),
    Marker: vi.fn(() => mockMarkerInstance),
    Popup: vi.fn(() => ({
      setHTML: vi.fn().mockReturnThis(),
    })),
    NavigationControl: vi.fn(),
  },
}));

describe("Map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkers.clear();
  });

  test("renders map container with correct structure", () => {
    renderWithProviders(<Map />);

    // Should render the map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer).toHaveClass("w-full", "h-full");
  });

  test("initializes map on mount", () => {
    renderWithProviders(<Map />);

    // Should initialize map and set up event listeners
    expect(mockMapInstance.on).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
    expect(mockMapInstance.on).toHaveBeenCalledWith(
      "moveend",
      expect.any(Function),
    );
  });

  test("handles empty events array gracefully", () => {
    renderWithProviders(<Map events={[]} />);

    // Should still render map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();

    // Map should still be initialized
    expect(mockMapInstance.on).toHaveBeenCalledWith(
      "load",
      expect.any(Function),
    );
  });

  test("cleans up map resources on unmount", () => {
    const { unmount } = renderWithProviders(<Map />);

    unmount();

    // Should call map remove method
    expect(mockMapInstance.remove).toHaveBeenCalled();
  });

  test("does not recreate map instance on props update", () => {
    const events1 = [
      { id: "1", longitude: 13.405, latitude: 52.52, title: "Event 1" },
    ];
    const events2 = [
      { id: "2", longitude: 2.3522, latitude: 48.8566, title: "Event 2" },
    ];

    const { rerender } = renderWithProviders(<Map events={events1} />);

    const initialLoadCalls = mockMapInstance.on.mock.calls.filter(
      (call) => call[0] === "load",
    ).length;

    // Update props
    rerender(<Map events={events2} />);

    // Should not create a new map instance (no additional 'load' event listeners)
    const newLoadCalls = mockMapInstance.on.mock.calls.filter(
      (call) => call[0] === "load",
    ).length;

    expect(newLoadCalls).toBe(initialLoadCalls); // Should only create map once
  });

  test("sets up onBoundsChange callback when provided", () => {
    const mockOnBoundsChange = vi.fn();
    renderWithProviders(<Map onBoundsChange={mockOnBoundsChange} />);

    // Should set up moveend listener for bounds changes
    expect(mockMapInstance.on).toHaveBeenCalledWith(
      "moveend",
      expect.any(Function),
    );
  });

  test("passes correct events prop to component", () => {
    const events = [
      { id: "1", longitude: 13.405, latitude: 52.52, title: "Berlin Event" },
      { id: "2", longitude: 2.3522, latitude: 48.8566, title: "Paris Event" },
    ];

    renderWithProviders(<Map events={events} />);

    // Component should render without errors with events prop
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });
});

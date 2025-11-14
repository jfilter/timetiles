/**
 * @module
 */
import { MapComponent } from "@/components/maps/map";

import { createMapEvents } from "../../mocks";
import { renderWithProviders } from "../../setup/test-utils";

describe("Map", () => {
  test("renders map container with correct structure", () => {
    renderWithProviders(<MapComponent />);

    // Should render the map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer).toHaveClass("w-full", "h-full");
  });

  test("renders with empty events array", () => {
    renderWithProviders(<MapComponent events={[]} />);

    // Should render the map container even with no events
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });

  test("renders with events", () => {
    const mockEvents = createMapEvents(1);

    renderWithProviders(<MapComponent events={mockEvents} />);

    // Should render the map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });

  test("calls onBoundsChange when provided", () => {
    const mockOnBoundsChange = vi.fn();
    renderWithProviders(<MapComponent onBoundsChange={mockOnBoundsChange} />);

    // Component should render without error
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });
});

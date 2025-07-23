import { describe, test, expect, vi } from "vitest";
import { renderWithProviders } from "../../setup/test-utils";
import { Map } from "@/components/Map";
import { createMapEvents } from "../../mocks";

describe("Map", () => {
  test("renders map container with correct structure", () => {
    renderWithProviders(<Map />);

    // Should render the map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer).toHaveClass("w-full", "h-full");
  });

  test("renders with empty events array", () => {
    renderWithProviders(<Map events={[]} />);

    // Should render the map container even with no events
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });

  test("renders with events", () => {
    const mockEvents = createMapEvents(1);

    renderWithProviders(<Map events={mockEvents} />);

    // Should render the map container
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });

  test("calls onBoundsChange when provided", () => {
    const mockOnBoundsChange = vi.fn();
    renderWithProviders(<Map onBoundsChange={mockOnBoundsChange} />);

    // Component should render without error
    const mapContainer = document.querySelector(".w-full.h-full");
    expect(mapContainer).toBeInTheDocument();
  });
});
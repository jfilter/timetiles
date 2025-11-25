/**
 * @module
 */
import { EventFilters } from "@/components/filters/event-filters";
import type { Catalog } from "@/payload-types";

import { createCatalogs, createDatasets, createRichText } from "../../mocks";
import { renderWithProviders } from "../../setup/unit/react-render";

const mockCatalogs = createCatalogs(2);
const mockDatasets = createDatasets(3);

describe("EventFilters", () => {
  test("renders catalog cards when no catalog is selected", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />);

    // Should show catalog cards with names
    expect(container).toHaveTextContent("Test Catalog 1");
    expect(container).toHaveTextContent("Test Catalog 2");
    expect(container).toHaveTextContent("Catalogs");

    // Should NOT show dataset chips when no catalog is selected
    expect(container).not.toHaveTextContent("Air Quality Measurements");
    expect(container).not.toHaveTextContent("Datasets");
  });

  test("shows dataset chips when catalog is selected via URL state", () => {
    // Test the filtering logic by setting URL state to select first catalog
    const searchParams = new URLSearchParams("catalog=1");

    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />, {
      searchParams,
    });

    // Should show Datasets section
    expect(container).toHaveTextContent("Datasets");

    // Should show datasets from catalog 1 (Air Quality and GDP Growth Rates)
    expect(container).toHaveTextContent("Air Quality Measurements");
    expect(container).toHaveTextContent("GDP Growth Rates");

    // Should NOT show dataset from catalog 2
    expect(container).not.toHaveTextContent("Water Quality Data");
  });

  test("catalog cards are clickable buttons", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />);

    // Find all catalog card buttons
    const catalogButtons = container.querySelectorAll('button[type="button"]');

    // Should have at least 2 catalog buttons (one for each catalog)
    expect(catalogButtons.length).toBeGreaterThanOrEqual(2);

    // Buttons should be enabled
    const firstCatalogButton = Array.from(catalogButtons).find(
      (btn) => btn.textContent?.includes("Test Catalog 1") ?? btn.textContent?.includes("Test Catalog 2")
    );
    expect(firstCatalogButton).toBeTruthy();
    expect(firstCatalogButton).not.toBeDisabled();
  });

  test("catalog cards have appropriate styling classes", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />);

    // Find catalog card buttons
    const catalogButtons = container.querySelectorAll("button.rounded-sm.border-2");
    expect(catalogButtons.length).toBeGreaterThanOrEqual(1);

    // Catalog buttons should have base styling
    const firstButton = catalogButtons[0];
    expect(firstButton).toHaveClass("rounded-sm");
    expect(firstButton).toHaveClass("border-2");
    expect(firstButton).toHaveClass("p-3");
  });

  test("shows dataset counts in catalog cards", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />);

    // Should show dataset counts (Test Catalog 1 has 2 datasets, Test Catalog 2 has 1 dataset)
    expect(container).toHaveTextContent("2 datasets");
    expect(container).toHaveTextContent("1 dataset");
  });

  test("shows clear date filters button when dates are set", () => {
    const searchParams = new URLSearchParams("startDate=2024-01-01&endDate=2024-12-31");

    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />, {
      searchParams,
    });

    // Should show the clear button when dates are set
    expect(container).toHaveTextContent("Clear date filters");
  });

  test("does not show clear date filters button when no dates are set", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={mockCatalogs} datasets={mockDatasets} />);

    // Should not show the clear button when no dates are set
    expect(container).not.toHaveTextContent("Clear date filters");
  });

  test("shows no catalogs when empty catalogs array", () => {
    const { container } = renderWithProviders(<EventFilters catalogs={[]} datasets={[]} />);

    // Should show Catalogs label but no catalog cards
    expect(container).toHaveTextContent("Catalogs");
    expect(container).not.toHaveTextContent("datasets");
  });

  test("shows no datasets available when selected catalog has no datasets", () => {
    // Create a catalog with no associated datasets
    const catalogWithNoDatasets: Catalog = {
      id: 99,
      name: "Empty Catalog",
      slug: "empty-catalog",
      description: createRichText("Empty catalog"),
      _status: "published" as const,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    };

    const searchParams = new URLSearchParams("catalog=99");

    const { container } = renderWithProviders(
      <EventFilters catalogs={[...mockCatalogs, catalogWithNoDatasets]} datasets={mockDatasets} />,
      { searchParams }
    );

    // Should show "No datasets available" when catalog has no datasets
    expect(container).toHaveTextContent("No datasets available");
  });
});

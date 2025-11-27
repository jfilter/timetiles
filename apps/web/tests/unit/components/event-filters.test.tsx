/**
 * @module
 */
import { EventFilters } from "@/components/filters/event-filters";
import type { DataSourcesResponse } from "@/lib/hooks/use-data-sources-query";

import { createCatalogs, createDatasets } from "../../mocks";
import { renderWithProviders } from "../../setup/unit/react-render";

// Convert mock data to lightweight format
const mockCatalogs = createCatalogs(2);
const mockDatasets = createDatasets(3);

const mockDataSources: DataSourcesResponse = {
  catalogs: mockCatalogs.map((c) => ({ id: c.id, name: c.name })),
  datasets: mockDatasets.map((d) => ({
    id: d.id,
    name: d.name,
    catalogId: typeof d.catalog === "object" && d.catalog != null ? d.catalog.id : null,
  })),
};

// Mock the useDataSourcesQuery hook
vi.mock("@/lib/hooks/use-data-sources-query", () => ({
  useDataSourcesQuery: () => ({
    data: mockDataSources,
    isLoading: false,
    error: null,
  }),
}));

describe("EventFilters", () => {
  test("renders catalog cards when no catalog is selected", () => {
    const { container } = renderWithProviders(<EventFilters />);

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

    const { container } = renderWithProviders(<EventFilters />, {
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
    const { container } = renderWithProviders(<EventFilters />);

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
    const { container } = renderWithProviders(<EventFilters />);

    // Find catalog card buttons (masonry layout with condensed cards)
    const catalogButtons = container.querySelectorAll("button.rounded-sm.border");
    expect(catalogButtons.length).toBeGreaterThanOrEqual(1);

    // Catalog buttons should have base styling
    const firstButton = catalogButtons[0];
    expect(firstButton).toHaveClass("rounded-sm");
    expect(firstButton).toHaveClass("border");
    expect(firstButton).toHaveClass("p-2");
  });

  test("shows dataset counts in catalog cards", () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Should show dataset counts (Test Catalog 1 has 2 datasets, Test Catalog 2 has 1 dataset)
    expect(container).toHaveTextContent("2 datasets");
    expect(container).toHaveTextContent("1 dataset");
  });

  test("shows clear date filters button when dates are set", () => {
    const searchParams = new URLSearchParams("startDate=2024-01-01&endDate=2024-12-31");

    const { container } = renderWithProviders(<EventFilters />, {
      searchParams,
    });

    // Should show the clear button when dates are set
    expect(container).toHaveTextContent("Clear date filters");
  });

  test("does not show clear date filters button when no dates are set", () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Should not show the clear button when no dates are set
    expect(container).not.toHaveTextContent("Clear date filters");
  });
});

describe("EventFilters with empty data", () => {
  beforeEach(() => {
    // Override mock for empty data tests
    vi.doMock("@/lib/hooks/use-data-sources-query", () => ({
      useDataSourcesQuery: () => ({
        data: { catalogs: [], datasets: [] },
        isLoading: false,
        error: null,
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/hooks/use-data-sources-query");
  });

  test("shows no catalogs when empty catalogs array", async () => {
    // Re-import to get mocked version
    const { EventFilters: MockedEventFilters } = await import("@/components/filters/event-filters");
    const { container } = renderWithProviders(<MockedEventFilters />);

    // Should show Catalogs label but no catalog cards
    expect(container).toHaveTextContent("Catalogs");
  });
});

describe("EventFilters with catalog having no datasets", () => {
  beforeEach(() => {
    vi.doMock("@/lib/hooks/use-data-sources-query", () => ({
      useDataSourcesQuery: () => ({
        data: {
          catalogs: [{ id: 99, name: "Empty Catalog" }],
          datasets: [],
        },
        isLoading: false,
        error: null,
      }),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/hooks/use-data-sources-query");
  });

  test("shows no datasets available when selected catalog has no datasets", async () => {
    const searchParams = new URLSearchParams("catalog=99");

    const { EventFilters: MockedEventFilters } = await import("@/components/filters/event-filters");
    const { container } = renderWithProviders(<MockedEventFilters />, { searchParams });

    // Should show "No datasets available" when catalog has no datasets
    expect(container).toHaveTextContent("No datasets available");
  });
});

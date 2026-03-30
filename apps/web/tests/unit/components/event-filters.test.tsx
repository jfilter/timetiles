/**
 * @module
 */
import { EventFilters } from "@/components/filters/event-filters";
import type { DataSourcesResponse } from "@/lib/hooks/use-data-sources-query";

import { createCatalogs, createDatasets } from "../../mocks";
import { fireEvent, renderWithProviders, waitFor, within } from "../../setup/unit/react-render";

// Convert mock data to lightweight format
const mockCatalogs = createCatalogs(2);
const mockDatasets = createDatasets(3);

const mockDataSources: DataSourcesResponse = {
  catalogs: mockCatalogs.map((c) => ({ id: c.id, name: c.name, isOwned: false })),
  datasets: mockDatasets.map((d) => ({
    id: d.id,
    name: d.name,
    catalogId: typeof d.catalog === "object" && d.catalog != null ? d.catalog.id : (d.catalog as number | null),
    hasTemporalData: true,
  })),
};

// Mock the useDataSourcesQuery hook
vi.mock("@/lib/hooks/use-data-sources-query", () => ({
  useDataSourcesQuery: () => ({ data: mockDataSources, isLoading: false, error: null }),
}));

// Mock the view context (no view active by default)
const mockViewContext = {
  view: null,
  hasView: false,
  dataScope: { mode: "all" },
  filterConfig: { mode: "auto", maxFilters: 5 },
  mapSettings: { baseMapStyle: "default" },
};
vi.mock("@/lib/context/view-context", () => ({ useView: () => mockViewContext }));

describe("EventFilters", () => {
  test("renders catalog groups with dataset rows", () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Should show catalog names as group headers
    expect(container).toHaveTextContent("Test Catalog 1");
    expect(container).toHaveTextContent("Test Catalog 2");

    // Should show dataset names (all datasets visible by default)
    expect(container).toHaveTextContent("Air Quality Measurements");
    expect(container).toHaveTextContent("Water Quality Data");
    expect(container).toHaveTextContent("GDP Growth Rates");
  });

  test("catalog checkbox toggles all datasets in that catalog", async () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Find catalog checkbox by its aria-label
    const catalogCheckbox = within(container).getByRole("checkbox", { name: "Select all datasets in Test Catalog 1" });
    expect(catalogCheckbox).not.toBeDisabled();

    // Click the catalog checkbox to select all its datasets
    fireEvent.click(catalogCheckbox);

    // After click, the aria-label should change to "Deselect all" (selected state)
    await waitFor(() => {
      within(container).getByRole("checkbox", { name: "Deselect all datasets in Test Catalog 1" });
    });
  });

  test("renders checkboxes for datasets", () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Should have checkboxes (catalog groups + individual datasets)
    const checkboxes = container.querySelectorAll('[role="checkbox"]');
    expect(checkboxes.length).toBeGreaterThanOrEqual(3);
  });

  test("shows clear date filters button when dates are set", () => {
    const searchParams = new URLSearchParams("startDate=2024-01-01&endDate=2024-12-31");

    const { container } = renderWithProviders(<EventFilters />, { searchParams });

    // Should show the clear button when dates are set
    expect(container).toHaveTextContent("Clear date filters");
  });

  test("does not show clear date filters button when no dates are set", () => {
    const { container } = renderWithProviders(<EventFilters />);

    // Should not show the clear button when no dates are set
    expect(container).not.toHaveTextContent("Clear date filters");
  });
});

// Empty data edge cases are tested via data-source-selector-helpers (groupDatasetsByCatalog returns [])
// and the DataSourceSelector component (renders "No datasets available" when groups are empty).

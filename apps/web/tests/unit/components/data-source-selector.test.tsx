/**
 * Unit tests for the DataSourceSelector component.
 *
 * Tests checkbox tree rendering, catalog group toggle, dataset selection,
 * event counts, empty states, and ownership grouping.
 *
 * @module
 */
import { DataSourceSelector } from "@/components/filters/data-source-selector";
import type { DataSourcesResponse } from "@/lib/hooks/use-data-sources-query";

import { renderWithProviders, within } from "../../setup/unit/react-render";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------
let mockDataSources: DataSourcesResponse = { catalogs: [], datasets: [] };
let mockAuthState = {
  isAuthenticated: false,
  isEmailVerified: false,
  userId: null as number | null,
  isLoading: false,
  user: null,
};

// Mock the useDataSourcesQuery hook
vi.mock("@/lib/hooks/use-data-sources-query", () => ({
  useDataSourcesQuery: () => ({ data: mockDataSources, isLoading: false, error: null }),
}));

// Mock the auth state hook
vi.mock("@/lib/hooks/use-auth-queries", () => ({ useAuthState: () => mockAuthState }));

// Mock the view context (no view active, but provider is present)
const mockViewContext = {
  view: null,
  hasView: false,
  dataScope: { mode: "all" as const },
  filterConfig: { mode: "auto" as const, maxFilters: 5 },
  mapSettings: { baseMapStyle: "default" as const },
};
vi.mock("@/lib/context/view-context", () => ({ useView: () => mockViewContext }));

describe("DataSourceSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDataSources = {
      catalogs: [
        { id: 1, name: "Environmental Data", isOwned: false },
        { id: 2, name: "Economic Data", isOwned: false },
        { id: 3, name: "Social Data", isOwned: false },
      ],
      datasets: [
        { id: 10, name: "Air Quality", catalogId: 1, hasTemporalData: true },
        { id: 11, name: "Water Quality", catalogId: 1, hasTemporalData: true },
        { id: 20, name: "GDP Growth", catalogId: 2, hasTemporalData: true },
        { id: 30, name: "Census Data", catalogId: 3, hasTemporalData: true },
      ],
    };
    mockAuthState = { isAuthenticated: false, isEmailVerified: false, userId: null, isLoading: false, user: null };
  });

  describe("Checkbox tree rendering", () => {
    it("renders catalog names as group headers", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("Environmental Data");
      expect(container).toHaveTextContent("Economic Data");
      expect(container).toHaveTextContent("Social Data");
    });

    it("renders dataset names within groups", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("Air Quality");
      expect(container).toHaveTextContent("Water Quality");
      expect(container).toHaveTextContent("GDP Growth");
      expect(container).toHaveTextContent("Census Data");
    });

    it("renders checkboxes for catalogs and datasets", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      // 1 multi-dataset catalog checkbox + 2 nested dataset checkboxes
      // + 2 single-dataset flat rows = 5 checkboxes total
      const checkboxes = container.querySelectorAll('[role="checkbox"]');
      expect(checkboxes).toHaveLength(5);
    });
  });

  describe("Catalog group toggle", () => {
    it("shows catalog checkbox with select-all aria-label when nothing selected", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      const checkbox = within(container).getByRole("checkbox", { name: "Select all datasets in Environmental Data" });
      expect(checkbox).toBeInTheDocument();
    });

    it("shows deselect-all aria-label when all datasets in catalog are selected", () => {
      const searchParams = new URLSearchParams("datasets=10,11");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      const checkbox = within(container).getByRole("checkbox", { name: "Deselect all datasets in Environmental Data" });
      expect(checkbox).toBeInTheDocument();
    });
  });

  describe("Dataset selection", () => {
    it("shows selected datasets as checked", () => {
      const searchParams = new URLSearchParams("datasets=10");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Air Quality (id=10) checkbox should be checked
      const checkboxes = container.querySelectorAll('[role="checkbox"]');
      // Find the one that corresponds to Air Quality dataset
      const checkedBoxes = Array.from(checkboxes).filter(
        (cb) => cb.getAttribute("data-state") === "checked" || cb.getAttribute("aria-checked") === "true"
      );
      expect(checkedBoxes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Event counts", () => {
    it("shows event counts on catalog headers when provided", () => {
      // Only Environmental Data (id=1) has >1 dataset, so only it renders a catalog header
      const eventCountsByCatalog = { "1": 1500 };

      const { container } = renderWithProviders(<DataSourceSelector eventCountsByCatalog={eventCountsByCatalog} />);

      expect(container).toHaveTextContent("1.5k");
    });

    it("shows event counts on dataset rows when provided", () => {
      const eventCountsByDataset = { "10": 800, "11": 250 };

      const { container } = renderWithProviders(<DataSourceSelector eventCountsByDataset={eventCountsByDataset} />);

      expect(container).toHaveTextContent("800");
      expect(container).toHaveTextContent("250");
    });
  });

  describe("Empty states", () => {
    it("shows no datasets message when no catalogs or datasets", () => {
      mockDataSources = { catalogs: [], datasets: [] };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("No datasets available");
    });

    it("shows no datasets message when catalog has no datasets", () => {
      mockDataSources = { catalogs: [{ id: 99, name: "Empty Catalog", isOwned: false }], datasets: [] };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("No datasets available");
    });
  });

  describe("Ownership grouping", () => {
    it("shows flat list for anonymous users (no group headings)", () => {
      mockAuthState = { isAuthenticated: false, isEmailVerified: false, userId: null, isLoading: false, user: null };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).not.toHaveTextContent("My Catalogs");
      expect(container).not.toHaveTextContent("Public Catalogs");
      expect(container).toHaveTextContent("Environmental Data");
      expect(container).toHaveTextContent("Economic Data");
    });

    it("shows grouped catalogs for authenticated user with owned catalogs", () => {
      mockAuthState = { isAuthenticated: true, isEmailVerified: true, userId: 1, isLoading: false, user: null };
      mockDataSources = {
        catalogs: [
          { id: 1, name: "My Events", isOwned: true },
          { id: 2, name: "Public Events", isOwned: false },
        ],
        datasets: [
          { id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true },
          { id: 20, name: "Dataset B", catalogId: 2, hasTemporalData: true },
        ],
      };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("My Catalogs");
      expect(container).toHaveTextContent("Public Catalogs");
      expect(container).toHaveTextContent("My Events");
      expect(container).toHaveTextContent("Public Events");
    });

    it("shows flat list for authenticated user with no owned catalogs", () => {
      mockAuthState = { isAuthenticated: true, isEmailVerified: true, userId: 1, isLoading: false, user: null };
      mockDataSources = {
        catalogs: [
          { id: 1, name: "Public A", isOwned: false },
          { id: 2, name: "Public B", isOwned: false },
        ],
        datasets: [
          { id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true },
          { id: 20, name: "Dataset B", catalogId: 2, hasTemporalData: true },
        ],
      };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).not.toHaveTextContent("My Catalogs");
      expect(container).not.toHaveTextContent("Public Catalogs");
      expect(container).toHaveTextContent("Public A");
      expect(container).toHaveTextContent("Public B");
    });

    it("does not show Public Catalogs heading when all catalogs are owned", () => {
      mockAuthState = { isAuthenticated: true, isEmailVerified: true, userId: 1, isLoading: false, user: null };
      mockDataSources = {
        catalogs: [
          { id: 1, name: "My Catalog A", isOwned: true },
          { id: 2, name: "My Catalog B", isOwned: true },
        ],
        datasets: [
          { id: 10, name: "Dataset A", catalogId: 1, hasTemporalData: true },
          { id: 20, name: "Dataset B", catalogId: 2, hasTemporalData: true },
        ],
      };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("My Catalogs");
      expect(container).not.toHaveTextContent("Public Catalogs");
    });
  });
});

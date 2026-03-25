/**
 * Unit tests for the DataSourceSelector component.
 *
 * Tests catalog card rendering, selected state, dataset chips,
 * active state, event counts, empty states, and ownership grouping.
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
    // Reset to default data before each test (all catalogs not owned)
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
    // Default to anonymous
    mockAuthState = { isAuthenticated: false, isEmailVerified: false, userId: null, isLoading: false, user: null };
  });

  describe("Catalog card rendering", () => {
    it("renders catalog cards from provided data", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("Environmental Data");
      expect(container).toHaveTextContent("Economic Data");
      expect(container).toHaveTextContent("Social Data");
    });

    it("renders the Catalogs section heading", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("Catalogs");
    });

    it("shows dataset counts in catalog cards", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      // Environmental Data has 2 datasets
      expect(container).toHaveTextContent("2 datasets");
      // Economic Data has 1 dataset
      expect(container).toHaveTextContent("1 dataset");
    });
  });

  describe("Selected catalog state", () => {
    it("shows selected state for active catalog via URL", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10,11");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // The selected catalog button should have a "Deselect" aria-label
      const selectedButton = within(container).getByRole("button", { name: /Deselect catalog Environmental Data/ });
      expect(selectedButton).toBeInTheDocument();
    });

    it("shows unselected state for non-active catalogs", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10,11");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Other catalogs should have "Select" aria-labels
      const unselectedButton = within(container).getByRole("button", { name: /Select catalog Economic Data/ });
      expect(unselectedButton).toBeInTheDocument();
    });
  });

  describe("Dataset chips rendering", () => {
    it("renders dataset chips within selected catalog", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10,11");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Datasets section should appear
      expect(container).toHaveTextContent("Datasets");
      // Both datasets from catalog 1 should be shown
      expect(container).toHaveTextContent("Air Quality");
      expect(container).toHaveTextContent("Water Quality");
    });

    it("does not render dataset chips when no catalog is selected", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      // Should NOT show the Datasets section
      expect(container).not.toHaveTextContent("Datasets");
    });

    it("only shows datasets belonging to the selected catalog", () => {
      const searchParams = new URLSearchParams("catalog=2&datasets=20");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Should show GDP Growth (catalog 2)
      expect(container).toHaveTextContent("GDP Growth");
      // Should NOT show datasets from other catalogs
      expect(container).not.toHaveTextContent("Air Quality");
      expect(container).not.toHaveTextContent("Census Data");
    });
  });

  describe("Active dataset state", () => {
    it("shows active state for enabled datasets", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10,11");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Both datasets should have "Disable" aria-labels (they are active)
      const airQualityButton = within(container).getByRole("button", { name: /Disable dataset Air Quality/ });
      expect(airQualityButton).toBeInTheDocument();

      const waterQualityButton = within(container).getByRole("button", { name: /Disable dataset Water Quality/ });
      expect(waterQualityButton).toBeInTheDocument();
    });

    it("shows inactive state for disabled datasets", () => {
      // Select catalog 1 but only enable dataset 10 (not 11)
      const searchParams = new URLSearchParams("catalog=1&datasets=10");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Air Quality (id=10) should be active
      const activeButton = within(container).getByRole("button", { name: /Disable dataset Air Quality/ });
      expect(activeButton).toBeInTheDocument();

      // Water Quality (id=11) should be inactive
      const inactiveButton = within(container).getByRole("button", { name: /Enable dataset Water Quality/ });
      expect(inactiveButton).toBeInTheDocument();
    });

    it("shows active count when not all datasets are enabled", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      // Should show "(1/2 active)" indicator
      expect(container).toHaveTextContent("1/2 active");
    });
  });

  describe("Event counts", () => {
    it("shows event counts on catalog cards when provided", () => {
      const eventCountsByCatalog = { "1": 1500, "2": 300 };

      const { container } = renderWithProviders(<DataSourceSelector eventCountsByCatalog={eventCountsByCatalog} />);

      // formatCount converts 1500 to "1.5k"
      expect(container).toHaveTextContent("1.5k events");
      expect(container).toHaveTextContent("300 events");
    });

    it("shows event counts on dataset chips when provided", () => {
      const searchParams = new URLSearchParams("catalog=1&datasets=10,11");
      const eventCountsByDataset = { "10": 800, "11": 250 };

      const { container } = renderWithProviders(<DataSourceSelector eventCountsByDataset={eventCountsByDataset} />, {
        searchParams,
      });

      expect(container).toHaveTextContent("800");
      expect(container).toHaveTextContent("250");
    });

    it("does not show event count text when counts are not provided", () => {
      const { container } = renderWithProviders(<DataSourceSelector />);

      // Should not show "events" text on catalog cards when no counts
      const buttons = container.querySelectorAll('button[type="button"]');
      const textsWithEvents = Array.from(buttons).filter((btn) => btn.textContent?.includes("events") ?? false);
      expect(textsWithEvents).toHaveLength(0);
    });
  });

  describe("Empty catalogs", () => {
    it("renders no catalog cards when catalogs array is empty", () => {
      mockDataSources = { catalogs: [], datasets: [] };

      const { container } = renderWithProviders(<DataSourceSelector />);

      // Should show "Catalogs" heading but no catalog buttons
      expect(container).toHaveTextContent("Catalogs");

      // No catalog card buttons should exist (no buttons with "Select catalog" labels)
      const catalogButtons = container.querySelectorAll('button[aria-label*="catalog"]');
      expect(catalogButtons).toHaveLength(0);
    });

    it("shows no datasets available when selected catalog has no datasets", () => {
      mockDataSources = { catalogs: [{ id: 99, name: "Empty Catalog", isOwned: false }], datasets: [] };

      const searchParams = new URLSearchParams("catalog=99");

      const { container } = renderWithProviders(<DataSourceSelector />, { searchParams });

      expect(container).toHaveTextContent("No datasets available");
    });
  });

  describe("Ownership grouping", () => {
    it("shows flat grid for anonymous users (no group headings)", () => {
      mockAuthState = { isAuthenticated: false, isEmailVerified: false, userId: null, isLoading: false, user: null };
      mockDataSources = {
        catalogs: [
          { id: 1, name: "Environmental Data", isOwned: false },
          { id: 2, name: "Economic Data", isOwned: false },
        ],
        datasets: [],
      };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).not.toHaveTextContent("My Catalogs");
      expect(container).not.toHaveTextContent("Public Catalogs");
      // All catalogs still render
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

    it("shows flat grid for authenticated user with no owned catalogs", () => {
      mockAuthState = { isAuthenticated: true, isEmailVerified: true, userId: 1, isLoading: false, user: null };
      // All catalogs are public (none owned)
      mockDataSources = {
        catalogs: [
          { id: 1, name: "Public A", isOwned: false },
          { id: 2, name: "Public B", isOwned: false },
        ],
        datasets: [],
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
        datasets: [],
      };

      const { container } = renderWithProviders(<DataSourceSelector />);

      expect(container).toHaveTextContent("My Catalogs");
      expect(container).not.toHaveTextContent("Public Catalogs");
    });
  });
});

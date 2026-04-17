/**
 * @module
 */
import { cleanup, screen, waitFor } from "@testing-library/react";

import { EventHistogram } from "@/components/charts/event-histogram";

import { useHistogramQuery, useTemporalClustersQuery } from "../../../lib/hooks/use-events-queries";
import { renderWithProviders } from "../../setup/unit/react-render";

// Mock next-themes to avoid matchMedia issues in tests
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
  useTheme: () => ({ theme: "light", setTheme: () => {}, resolvedTheme: "light" }),
}));

// Mock the UI charts package
vi.mock("@timetiles/ui/charts", async () => {
  const actual = await vi.importActual("@timetiles/ui/charts");
  return { ...(actual as any), useChartTheme: () => ({ backgroundColor: "#ffffff", textColor: "#000000" }) };
});

// Mock view context
vi.mock("@/lib/context/view-context", () => ({
  useView: () => ({
    view: null,
    hasView: false,
    dataScope: { mode: "all" },
    filterConfig: { mode: "auto", maxFilters: 5 },
    mapSettings: { baseMapStyle: "default" },
  }),
}));

// Mock the filters hook
vi.mock("../../../lib/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} },
    setSingleDayFilter: vi.fn(),
  }),
}));

// Mock the UI store
vi.mock("../../../lib/store", () => ({
  useUIStore: (selector: any) => {
    const state = {
      ui: {
        mapBounds: null, // No map bounds
        clusterFilterCells: null,
      },
    };
    return selector ? selector(state) : state;
  },
}));

// Mock the view scope hook
vi.mock("../../../lib/hooks/use-view-scope", () => ({ useViewScope: () => ({ mode: "all" }) }));

// Mock the React Query hooks — loading phase is now computed inside the hook
vi.mock("../../../lib/hooks/use-events-queries", () => ({
  useHistogramQuery: vi.fn(),
  useTemporalClustersQuery: vi.fn(),
}));

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    return <div data-testid="echarts-mock">{JSON.stringify(option?.series?.[0]?.data ?? [])}</div>;
  },
}));

const mockUseHistogramQuery = useHistogramQuery as any;
const mockUseTemporalClustersQuery = useTemporalClustersQuery as any;

describe.sequential("EventHistogram", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockUseTemporalClustersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isInitialLoad: false,
      isUpdating: false,
      isError: false,
    });
    // Note: vi.resetModules() removed - it clears the matchMedia mock needed by next-themes
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders loading state", () => {
    // Mock the query as loading (initial load — no data yet)
    mockUseHistogramQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      isInitialLoad: true,
      isUpdating: false,
    });

    renderWithProviders(<EventHistogram />);
    // Check for skeleton loading state (ChartSkeleton uses animate-pulse)
    const loadingSkeleton = document.querySelector(".animate-pulse");
    expect(loadingSkeleton).toBeInTheDocument();
  });

  it("renders no data state when histogram data is empty", async () => {
    // Mock the query with empty data
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: [] },
      isLoading: false,
      error: null,
      isInitialLoad: false,
      isUpdating: false,
    });

    renderWithProviders(<EventHistogram />);

    // Wait for no data message to appear
    await waitFor(() => {
      expect(screen.getByText("No data available")).toBeInTheDocument();
    });
  });

  it("renders chart when data is available", async () => {
    // API now returns timestamps with dateEnd (flexible bucketing)
    const mockHistogramData = [
      { date: new Date("2024-01-01").getTime(), dateEnd: new Date("2024-01-02").getTime(), count: 5 },
      { date: new Date("2024-01-02").getTime(), dateEnd: new Date("2024-01-03").getTime(), count: 10 },
    ];

    // Mock the query with data including metadata
    mockUseHistogramQuery.mockReturnValue({
      data: {
        histogram: mockHistogramData,
        metadata: {
          total: 15,
          dateRange: { min: "2024-01-01T00:00:00Z", max: "2024-01-03T00:00:00Z" },
          bucketSizeSeconds: 86400,
          bucketCount: 2,
          counts: { datasets: 0, catalogs: 0 },
          topDatasets: [],
          topCatalogs: [],
        },
      },
      isLoading: false,
      error: null,
      isInitialLoad: false,
      isUpdating: false,
    });

    renderWithProviders(<EventHistogram />);

    // Wait for the chart to render
    await waitFor(() => {
      const chartElement = screen.getByTestId("echarts-mock");
      // Verify timestamps are in the chart data
      const timestamp1 = new Date("2024-01-01").getTime().toString();
      const timestamp2 = new Date("2024-01-02").getTime().toString();
      expect(chartElement.textContent).toContain(timestamp1);
      expect(chartElement.textContent).toContain(timestamp2);
      expect(chartElement.textContent).toContain("5");
      expect(chartElement.textContent).toContain("10");
    });
  });

  it("renders translated grouped controls", async () => {
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: [] },
      isLoading: false,
      error: null,
      isInitialLoad: false,
      isUpdating: false,
    });

    renderWithProviders(<EventHistogram groupBy="dataset" showControls onMaxGroupsChange={vi.fn()} maxGroups={6} />);

    await waitFor(() => {
      expect(screen.getByText("Top groups")).toBeInTheDocument();
      expect(screen.getByText("Fewer")).toBeInTheDocument();
      expect(screen.getByText("More")).toBeInTheDocument();
    });
  });
});

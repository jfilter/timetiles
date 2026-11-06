/**
 * @module
 */
import { screen, waitFor } from "@testing-library/react";

import { EventHistogram } from "@/components/charts/event-histogram";

import { useHistogramQuery, useTemporalClustersQuery } from "../../../lib/hooks/use-events-queries";
import { renderWithProviders } from "../../setup/unit/react-render";

// Mock next-themes to avoid matchMedia issues in tests
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: unknown }) => children,
  useTheme: () => ({ theme: "light", setTheme: () => {}, resolvedTheme: "light" }),
}));

vi.mock("@timetiles/ui/charts", async () => {
  const actual = await vi.importActual("@timetiles/ui/charts");
  return { ...(actual as any), useChartTheme: () => ({ backgroundColor: "#ffffff", textColor: "#000000" }) };
});

vi.mock("@/lib/context/view-context", () => ({
  useView: () => ({
    view: null,
    hasView: false,
    dataScope: { mode: "all" },
    filterConfig: { mode: "auto", maxFilters: 5 },
    mapSettings: { baseMapStyle: "default" },
  }),
}));

vi.mock("../../../lib/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: {} },
    setBucketRangeFilter: vi.fn(),
  }),
}));

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

vi.mock("../../../lib/hooks/use-view-scope", () => ({ useViewScope: () => ({ mode: "all" }) }));

// Mock the React Query hooks; the loading phase is computed inside the hook
vi.mock("../../../lib/hooks/use-events-queries", () => ({
  useHistogramQuery: vi.fn(),
  useTemporalClustersQuery: vi.fn(),
}));

vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    return <div data-testid="echarts-mock">{JSON.stringify(option?.series?.[0]?.data ?? [])}</div>;
  },
}));

const mockUseHistogramQuery = useHistogramQuery as any;
const mockUseTemporalClustersQuery = useTemporalClustersQuery as any;

describe("EventHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTemporalClustersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isInitialLoad: false,
      isUpdating: false,
      isError: false,
    });
    // No vi.resetModules(): it clears the matchMedia mock needed by next-themes
  });

  afterEach(() => {
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
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: [] },
      isLoading: false,
      error: null,
      isInitialLoad: false,
      isUpdating: false,
    });

    renderWithProviders(<EventHistogram />);

    await waitFor(() => {
      expect(screen.getByText("No matching events")).toBeInTheDocument();
      expect(screen.getByText("Try adjusting your filters")).toBeInTheDocument();
    });
  });

  it("renders chart when data is available", async () => {
    // The temporal API returns ISO date STRINGS (HistogramBucketSchema.date is
    // z.string()) — the fixture must match, or string-handling regressions in
    // the chart (tooltip/click guards) slip past this test.
    const mockHistogramData = [
      { date: "2024-01-01T00:00:00.000Z", dateEnd: "2024-01-02T00:00:00.000Z", count: 5 },
      { date: "2024-01-02T00:00:00.000Z", dateEnd: "2024-01-03T00:00:00.000Z", count: 10 },
    ];

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

    await waitFor(() => {
      const chartElement = screen.getByTestId("echarts-mock");
      expect(chartElement.textContent).toContain("2024-01-01T00:00:00.000Z");
      expect(chartElement.textContent).toContain("2024-01-02T00:00:00.000Z");
      expect(chartElement.textContent).toContain("5");
      expect(chartElement.textContent).toContain("10");
    });
  });

  it("propagates bucketEnd into grouped series so tooltips span the full bucket", async () => {
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: [] },
      isLoading: false,
      error: null,
      isInitialLoad: false,
      isUpdating: false,
    });
    mockUseTemporalClustersQuery.mockReturnValue({
      data: {
        items: [
          {
            groupName: "Dataset A",
            count: 5,
            bucketStart: "2024-01-01T00:00:00.000Z",
            bucketEnd: "2024-01-08T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isInitialLoad: false,
      isUpdating: false,
      isError: false,
    });

    renderWithProviders(<EventHistogram groupBy="dataset" />);

    await waitFor(() => {
      const chartElement = screen.getByTestId("echarts-mock");
      // Series data is [date, count, dateEnd] — dateEnd must be the real bucket end,
      // not fall back to the start (which would collapse a weekly bucket to one day).
      expect(chartElement.textContent).toContain("2024-01-08T00:00:00.000Z");
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

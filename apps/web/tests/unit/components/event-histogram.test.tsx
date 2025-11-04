/**
 * @module
 */
import { cleanup, screen, waitFor } from "@testing-library/react";

import { EventHistogram } from "../../../components/event-histogram";
import { useHistogramQuery } from "../../../lib/hooks/use-events-queries";
import { renderWithProviders } from "../../setup/test-utils";

// Mock next-themes is handled by ThemeProvider in test-utils

// Mock the filters hook
vi.mock("../../../lib/filters", () => ({
  useFilters: () => ({
    filters: {
      catalog: null,
      datasets: [],
      startDate: null,
      endDate: null,
    },
  }),
}));

// Mock the UI store
vi.mock("../../../lib/store", () => ({
  useUIStore: (selector: any) => {
    const state = {
      ui: {
        mapBounds: null, // No map bounds
      },
    };
    return selector ? selector(state) : state;
  },
}));

// Mock the React Query hook
vi.mock("../../../lib/hooks/use-events-queries", () => ({
  useHistogramQuery: vi.fn(),
}));

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    return <div data-testid="echarts-mock">{JSON.stringify(option?.series?.[0]?.data || [])}</div>;
  },
}));

const mockUseHistogramQuery = useHistogramQuery as any;

describe.sequential("EventHistogram", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders loading state", () => {
    // Mock the query as loading
    mockUseHistogramQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderWithProviders(<EventHistogram isInitialLoad />);
    expect(screen.getByText("Loading histogram...")).toBeInTheDocument();
  });

  it("renders no data state when histogram data is empty", async () => {
    // Mock the query with empty data
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: [] },
      isLoading: false,
      error: null,
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
});

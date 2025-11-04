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
    const mockHistogramData = [
      { date: "2024-01-01", count: 5 },
      { date: "2024-01-02", count: 10 },
    ];

    // Mock the query with data
    mockUseHistogramQuery.mockReturnValue({
      data: { histogram: mockHistogramData },
      isLoading: false,
      error: null,
    });

    renderWithProviders(<EventHistogram />);

    // Wait for the chart to render
    await waitFor(() => {
      const chartElement = screen.getByTestId("echarts-mock");
      expect(chartElement.textContent).toContain("2024-01-01");
      expect(chartElement.textContent).toContain("2024-01-02");
    });
  });
});

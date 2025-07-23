import { screen, cleanup, waitFor, act } from "@testing-library/react";
import { renderWithProviders } from "../../setup/test-utils";
import { EventHistogram } from "../../../components/event-histogram";

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

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    return (
      <div data-testid="echarts-mock">
        {JSON.stringify(option?.series?.[0]?.data || [])}
      </div>
    );
  },
}));

describe.sequential("EventHistogram", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.resetModules();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders loading state", () => {
    renderWithProviders(<EventHistogram loading={true} />);
    expect(screen.getByText("Loading histogram...")).toBeInTheDocument();
  });

  it("renders no data state when histogram data is empty", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ histogram: [] }),
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

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ histogram: mockHistogramData }),
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

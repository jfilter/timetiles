import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EventHistogram } from "../../components/EventHistogram";

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

// Mock nuqs
vi.mock("nuqs", () => ({
  parseAsString: {
    withDefault: () => {},
  },
  useQueryState: () => [null, vi.fn()],
}));

// Mock the filters hook
vi.mock("../../lib/filters", () => ({
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
vi.mock("../../lib/store", () => ({
  useUIStore: () => null, // No map bounds
}));

// Mock fetch
global.fetch = vi.fn();

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

describe("EventHistogram", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    render(<EventHistogram loading={true} />);
    expect(screen.getByText("Loading histogram...")).toBeInTheDocument();
  });

  it("renders no data state when histogram data is empty", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ histogram: [] }),
    });

    render(<EventHistogram />);
    
    // Wait for the component to load
    await screen.findByText("No data available");
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders chart when data is available", async () => {
    const mockHistogramData = [
      { date: "2024-01-01", count: 5 },
      { date: "2024-01-02", count: 10 },
    ];

    (global.fetch as any).mockResolvedValueOnce({
      json: async () => ({ histogram: mockHistogramData }),
    });

    render(<EventHistogram />);
    
    // Wait for the chart to render
    await screen.findByTestId("echarts-mock");
    const chartElement = screen.getByTestId("echarts-mock");
    
    // Check that the chart contains the expected data
    expect(chartElement.textContent).toContain("2024-01-01");
    expect(chartElement.textContent).toContain("2024-01-02");
  });
});
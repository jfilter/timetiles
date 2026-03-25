/**
 * @module
 */
import { cleanup, render, screen } from "@testing-library/react";

import { AggregationBarChart } from "@/components/charts/aggregation-bar-chart";

// Mock next-themes
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "light" }) }));

// Mock nuqs
vi.mock("nuqs", () => ({
  parseAsString: { withDefault: () => {} },
  parseAsArrayOf: () => ({ withDefault: () => ({}) }),
  useQueryState: () => [null, vi.fn()],
}));

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

// Mock filters hook
vi.mock("../../../lib/hooks/use-filters", () => ({
  useFilters: () => ({ filters: { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} } }),
}));

vi.mock("@timetiles/ui/charts", () => ({
  useChartTheme: () => ({
    backgroundColor: "#ffffff",
    textColor: "#000000",
    gridColor: "#f0f0f0",
    barColor: "#3b82f6",
  }),
  BarChart: ({ data }: any) => (
    <div data-testid="bar-chart-mock">
      {data.map((item: any) => (
        <div key={`${String(item.label)}-${String(item.value)}`} data-value={item.value}>
          {item.label}: {item.value}
        </div>
      ))}
    </div>
  ),
}));

// Mock events queries - define mocks in the factory to avoid hoisting issues
vi.mock("../../../lib/hooks/use-events-queries", () => {
  const mockEventsAggregationQuery = vi.fn((_filters, _bounds, groupBy) => ({
    data:
      groupBy === "dataset"
        ? {
            items: [
              { id: 1, name: "Dataset A", count: 2 },
              { id: 2, name: "Dataset B", count: 1 },
            ],
            total: 3,
            groupedBy: "dataset",
          }
        : { items: [], total: 0, groupedBy: "catalog" },
    isLoading: false,
    error: null,
    isInitialLoad: false,
    isUpdating: false,
  }));

  return { useEventsAggregationQuery: mockEventsAggregationQuery };
});

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    const data = option.series?.[0]?.data ?? [];
    return (
      <div data-testid="echarts-bar-mock">
        {data.map((value: number, index: number) => (
          <div key={`data-point-${String(value)}-${String(index)}`} data-value={value}>
            {value}
          </div>
        ))}
      </div>
    );
  },
}));

describe("AggregationBarChart - Dataset", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders bar chart with dataset data", () => {
    render(<AggregationBarChart type="dataset" />);

    const chart = screen.getByTestId("bar-chart-mock");
    expect(chart).toBeInTheDocument();

    // Mock provides 2 datasets: "Dataset A" (count 2) and "Dataset B" (count 1)
    const bars = chart.querySelectorAll("[data-value]");
    expect(bars).toHaveLength(2);
    expect(bars[0]).toHaveAttribute("data-value", "2");
    expect(bars[0]?.textContent).toContain("Dataset A");
    expect(bars[1]).toHaveAttribute("data-value", "1");
    expect(bars[1]?.textContent).toContain("Dataset B");
  });
});

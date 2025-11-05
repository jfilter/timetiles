/**
 * @module
 */
import { cleanup, render, screen } from "@testing-library/react";

import { AggregationBarChart } from "../../../components/aggregation-bar-chart";

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

// Mock nuqs
vi.mock("nuqs", () => ({
  parseAsString: {
    withDefault: () => {},
  },
  parseAsArrayOf: () => ({
    withDefault: () => ({}),
  }),
  useQueryState: () => [null, vi.fn()],
}));

// Mock filters hook
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

// Mock chart hooks
vi.mock("../../../lib/hooks/use-chart-query", () => ({
  useChartQuery: (query: any) => ({
    ...query,
    isInitialLoad: false,
    isUpdating: false,
  }),
}));

vi.mock("@workspace/ui/charts", () => ({
  useChartTheme: () => ({
    backgroundColor: "#ffffff",
    textColor: "#000000",
    gridColor: "#f0f0f0",
    barColor: "#3b82f6",
  }),
  BarChart: ({ data }: any) => (
    <div data-testid="bar-chart-mock">
      {data.map((item: any, index: number) => (
        <div key={index} data-value={item.value}>
          {item.label}: {item.value}
        </div>
      ))}
    </div>
  ),
}));

// Mock events queries
vi.mock("../../../lib/hooks/use-events-queries", () => {
  const mockEventsAggregationQuery = vi.fn((_filters, _bounds, groupBy) => ({
    data:
      groupBy === "catalog"
        ? {
            items: [{ id: 1, name: "Catalog 1", count: 3 }],
            total: 3,
            groupedBy: "catalog",
          }
        : {
            items: [],
            total: 0,
            groupedBy: "dataset",
          },
    isLoading: false,
    error: null,
  }));

  return {
    useEventsAggregationQuery: mockEventsAggregationQuery,
  };
});

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    const data = option.series?.[0]?.data || [];
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

describe("AggregationBarChart - Catalog", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders bar chart with catalog data", () => {
    render(<AggregationBarChart type="catalog" />);

    const chart = screen.getByTestId("bar-chart-mock");
    expect(chart).toBeInTheDocument();

    // Should have bars for catalogs with events
    const bars = chart.querySelectorAll("[data-value]");
    expect(bars.length).toBeGreaterThan(0);
  });
});

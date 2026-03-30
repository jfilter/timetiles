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
  useFilters: () => ({
    filters: { datasets: [], startDate: null, endDate: null, fieldFilters: {} },
    toggleCatalogDatasets: vi.fn(),
    toggleDataset: vi.fn(),
  }),
}));

// Mock data sources hook
vi.mock("@/lib/hooks/use-data-sources-query", () => ({
  useDataSourcesQuery: () => ({ data: { catalogs: [], datasets: [] }, isLoading: false, error: null }),
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

// Mock events queries
vi.mock("../../../lib/hooks/use-events-queries", () => {
  const mockEventsAggregationQuery = vi.fn((_filters, _bounds, groupBy) => ({
    data:
      groupBy === "catalog"
        ? { items: [{ id: 1, name: "Catalog 1", count: 3 }], total: 3, groupedBy: "catalog" }
        : { items: [], total: 0, groupedBy: "dataset" },
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

describe("AggregationBarChart - Catalog", () => {
  beforeEach(() => {
    cleanup();
  });

  it("renders bar chart with catalog data", () => {
    render(<AggregationBarChart type="catalog" />);

    const chart = screen.getByTestId("bar-chart-mock");
    expect(chart).toBeInTheDocument();

    // Mock provides 1 catalog ("Catalog 1" with count 3)
    const bars = chart.querySelectorAll("[data-value]");
    expect(bars).toHaveLength(1);
    expect(bars[0]).toHaveAttribute("data-value", "3");
    expect(bars[0]?.textContent).toContain("Catalog 1");
  });
});

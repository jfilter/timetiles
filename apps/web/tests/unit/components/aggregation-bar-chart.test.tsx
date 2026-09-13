/**
 * Tests for AggregationBarChart data mapping and click-to-filter routing.
 *
 * @module
 * @category Tests
 */
import { fireEvent, render, screen } from "@testing-library/react";

import { AggregationBarChart } from "@/components/charts/aggregation-bar-chart";

interface MockBarItem {
  label: string;
  value: number;
}

const mocks = vi.hoisted(() => ({
  toggleCatalogDatasets: vi.fn(),
  toggleDataset: vi.fn(),
  items: [] as Array<{ id: number; name: string; count: number }>,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

vi.mock("@/lib/hooks/use-view-scope", () => ({ useViewScope: () => undefined }));

vi.mock("@/lib/hooks/use-filters", () => ({
  useFilters: () => ({
    filters: { datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: {} },
    toggleCatalogDatasets: mocks.toggleCatalogDatasets,
    toggleDataset: mocks.toggleDataset,
  }),
}));

vi.mock("@/lib/hooks/use-data-sources-query", () => ({
  useDataSourcesQuery: () => ({
    data: {
      catalogs: [],
      datasets: [
        { id: 10, catalogId: 1 },
        { id: 11, catalogId: 2 },
        { id: 12, catalogId: 1 },
        { id: 13, catalogId: null },
      ],
    },
  }),
}));

vi.mock("@/lib/hooks/use-events-queries", () => ({
  useEventsAggregationQuery: () => ({
    data: { items: mocks.items },
    isInitialLoad: false,
    isUpdating: false,
    isError: false,
  }),
}));

vi.mock("@timetiles/ui/charts", () => ({
  useChartTheme: () => ({}),
  BarChart: ({ data, onBarClick }: { data: MockBarItem[]; onBarClick: (item: MockBarItem, index: number) => void }) => (
    <div data-testid="bar-chart-mock">
      {data.map((item, index) => (
        <button key={item.label} type="button" data-value={item.value} onClick={() => onBarClick(item, index)}>
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

describe("AggregationBarChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps aggregation items to bar labels and values", () => {
    mocks.items = [
      { id: 1, name: "Dataset A", count: 2 },
      { id: 2, name: "Dataset B", count: 1 },
    ];

    render(<AggregationBarChart type="dataset" />);

    const bars = screen.getByTestId("bar-chart-mock").querySelectorAll("[data-value]");
    expect([...bars].map((bar) => [bar.textContent, bar.getAttribute("data-value")])).toEqual([
      ["Dataset A", "2"],
      ["Dataset B", "1"],
    ]);
  });

  it("toggles the datasets of the clicked catalog", () => {
    mocks.items = [
      { id: 2, name: "Catalog 2", count: 5 },
      { id: 1, name: "Catalog 1", count: 3 },
    ];

    render(<AggregationBarChart type="catalog" />);
    fireEvent.click(screen.getByRole("button", { name: "Catalog 1" }));

    expect(mocks.toggleCatalogDatasets).toHaveBeenCalledExactlyOnceWith(["10", "12"]);
    expect(mocks.toggleDataset).not.toHaveBeenCalled();
  });

  it("toggles the clicked dataset by its string ID", () => {
    mocks.items = [
      { id: 7, name: "Dataset A", count: 2 },
      { id: 8, name: "Dataset B", count: 1 },
    ];

    render(<AggregationBarChart type="dataset" />);
    fireEvent.click(screen.getByRole("button", { name: "Dataset B" }));

    expect(mocks.toggleDataset).toHaveBeenCalledExactlyOnceWith("8");
    expect(mocks.toggleCatalogDatasets).not.toHaveBeenCalled();
  });
});

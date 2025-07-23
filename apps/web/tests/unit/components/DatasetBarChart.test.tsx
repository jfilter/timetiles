import { render, screen, cleanup } from "@testing-library/react";
import { DatasetBarChart } from "../../../components/DatasetBarChart";
import type { Event, Dataset, Catalog } from "../../../payload-types";

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

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    const data = option.series?.[0]?.data || [];
    return (
      <div data-testid="echarts-bar-mock">
        {data.map((value: number, index: number) => (
          <div key={index} data-value={value}>
            {value}
          </div>
        ))}
      </div>
    );
  },
}));

describe("DatasetBarChart", () => {
  beforeEach(() => {
    cleanup();
  });

  const mockDatasets: Dataset[] = [
    {
      id: 1,
      name: "Dataset A",
      catalog: 1,
      language: "en",
      schema: {},
      updatedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    },
    {
      id: 2,
      name: "Dataset B",
      catalog: 1,
      language: "en",
      schema: {},
      updatedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ];

  const mockCatalogs: Catalog[] = [
    {
      id: 1,
      name: "Catalog 1",
      updatedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    },
  ];

  const mockEvents: Event[] = [
    {
      id: 1,
      dataset: 1,
      data: { title: "Event 1" },
      eventTimestamp: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    },
    {
      id: 2,
      dataset: 1,
      data: { title: "Event 2" },
      eventTimestamp: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
      createdAt: "2024-01-02T00:00:00Z",
    },
    {
      id: 3,
      dataset: 2,
      data: { title: "Event 3" },
      eventTimestamp: "2024-01-03T00:00:00Z",
      updatedAt: "2024-01-03T00:00:00Z",
      createdAt: "2024-01-03T00:00:00Z",
    },
  ];

  it("renders bar chart with dataset grouping", () => {
    render(
      <DatasetBarChart
        events={mockEvents}
        datasets={mockDatasets}
        catalogs={mockCatalogs}
        groupBy="dataset"
      />,
    );

    const chart = screen.getByTestId("echarts-bar-mock");
    expect(chart).toBeInTheDocument();

    // Should have bars for datasets with events
    const bars = chart.querySelectorAll("[data-value]");
    expect(bars.length).toBeGreaterThan(0);
  });

  it("renders bar chart with catalog grouping", () => {
    const { container } = render(
      <DatasetBarChart
        events={mockEvents}
        datasets={mockDatasets}
        catalogs={mockCatalogs}
        groupBy="catalog"
      />,
    );

    const chart = container.querySelector('[data-testid="echarts-bar-mock"]');
    expect(chart).toBeInTheDocument();
  });

  it("shows loading state", () => {
    render(
      <DatasetBarChart
        events={[]}
        datasets={mockDatasets}
        catalogs={mockCatalogs}
        loading={true}
      />,
    );

    // Check for loading indicator
    const loadingElement = document.querySelector(".animate-spin");
    expect(loadingElement).toBeInTheDocument();
  });
});

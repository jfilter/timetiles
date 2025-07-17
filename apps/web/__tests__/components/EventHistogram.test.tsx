import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { EventHistogram } from "../../components/EventHistogram";
import type { Event } from "../../payload-types";

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

// Mock ECharts component
vi.mock("echarts-for-react", () => ({
  default: ({ option }: any) => {
    return (
      <div data-testid="echarts-mock">
        {JSON.stringify(option.series?.[0]?.data)}
      </div>
    );
  },
}));

describe("EventHistogram", () => {
  beforeEach(() => {
    cleanup();
  });

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
      dataset: 1,
      data: { title: "Event 3" },
      eventTimestamp: null,
      updatedAt: "2024-01-03T00:00:00Z",
      createdAt: "2024-01-03T00:00:00Z",
    },
  ];

  it("renders histogram with events", () => {
    render(<EventHistogram events={mockEvents} />);

    const chart = screen.getByTestId("echarts-mock");
    expect(chart).toBeInTheDocument();
  });

  it("filters out events without timestamps", () => {
    const { container } = render(<EventHistogram events={mockEvents} />);

    const chart = container.querySelector('[data-testid="echarts-mock"]');
    expect(chart).toBeInTheDocument();

    const data = JSON.parse(chart?.textContent || "[]");

    // Should have data for events with timestamps only
    expect(data.length).toBeGreaterThan(0);
  });

  it("shows loading state", () => {
    render(<EventHistogram events={[]} loading={true} />);

    // Check for loading indicator
    const loadingElement = document.querySelector(".animate-spin");
    expect(loadingElement).toBeInTheDocument();
  });
});

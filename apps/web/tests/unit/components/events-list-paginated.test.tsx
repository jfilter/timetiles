/**
 * @module
 */
import { screen } from "@testing-library/react";

import { EventsListPaginated } from "@/app/[locale]/(frontend)/explore/_components/events-list-paginated";
import type { FilterState } from "@/lib/hooks/use-filters";

import { useEventsInfiniteQuery, useEventsTotalQuery } from "../../../lib/hooks/use-events-list-queries";
import { renderWithProviders } from "../../setup/unit/react-render";

vi.mock("../../../lib/hooks/use-events-list-queries", () => ({
  useEventsInfiniteQuery: vi.fn(),
  useEventsTotalQuery: vi.fn(),
}));

vi.mock("../../../lib/hooks/use-view-scope", () => ({ useViewScope: () => ({ mode: "all" }) }));

vi.mock("../../../lib/store", () => ({
  useUIStore: (selector: (state: { ui: { clusterFilterCells: null } }) => unknown) =>
    selector({ ui: { clusterFilterCells: null } }),
}));

const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: {} };

const bounds = { north: 10, south: -10, east: 10, west: -10 };

describe("EventsListPaginated", () => {
  it("keeps the live count description when nothing matches the filters", () => {
    vi.mocked(useEventsInfiniteQuery).mockReturnValue({
      data: { pages: [{ events: [], total: 0 }] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof useEventsInfiniteQuery>);
    vi.mocked(useEventsTotalQuery).mockReturnValue({ data: { total: 86 } } as unknown as ReturnType<
      typeof useEventsTotalQuery
    >);

    renderWithProviders(<EventsListPaginated filters={filters} bounds={bounds} />);

    expect(screen.getByText("No events found")).toBeInTheDocument();
    const description = screen.getByText(/^Showing 0 of 86 events/);
    expect(description).toHaveAttribute("aria-live", "polite");
  });
});

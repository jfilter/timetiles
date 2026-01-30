/**
 * Paginated events list with "Load More" functionality.
 *
 * Uses React Query's useInfiniteQuery for efficient pagination
 * with automatic cache management and loading states.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, ContentState } from "@timetiles/ui";
import { Loader2 } from "lucide-react";
import { useCallback, useMemo } from "react";

import type { FilterState } from "@/lib/filters";
import { type SimpleBounds, useEventsInfiniteFlattened, useEventsTotalQuery } from "@/lib/hooks/use-events-queries";

import { EventsList } from "./events-list";
import { EventsListSkeleton } from "./events-list-skeleton";
import { buildEventsDescription, type FilterLabels } from "./map-explorer-helpers";

interface EventsListPaginatedProps {
  filters: FilterState;
  bounds: SimpleBounds | null;
  /** Selected dataset names for display */
  datasetNames?: string[];
  /** Human-readable date range for display (e.g., "Jan 2024 - Dec 2024") */
  dateRangeLabel?: string;
  /** Callback when an event card is clicked */
  onEventClick?: (eventId: number) => void;
}

export const EventsListPaginated = ({
  filters,
  bounds,
  datasetNames = [],
  dateRangeLabel,
  onEventClick,
}: Readonly<EventsListPaginatedProps>) => {
  const { events, total, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, error } =
    useEventsInfiniteFlattened(filters, bounds, 20);

  // Get global total (without bounds filter) to show "X of Y" when map limits results
  const { data: globalTotalData } = useEventsTotalQuery(filters);

  const handleLoadMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  // Build filter labels for the description (memoized to avoid recreating on each render)
  const filterLabels: FilterLabels = useMemo(
    () => ({
      datasets: datasetNames.map((name, idx) => ({ id: String(idx), name })),
      dateRange: dateRangeLabel,
      fieldFilters:
        filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
    }),
    [datasetNames, dateRangeLabel, filters.fieldFilters]
  );

  // Initial loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="bg-muted h-7 w-32 animate-pulse rounded" />
        </div>
        <EventsListSkeleton count={6} />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <ContentState
        variant="error"
        title="Failed to load events"
        subtitle={error?.message ?? "Something went wrong"}
        height={256}
      />
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - explains what's being shown */}
      <p className="text-muted-foreground text-sm">
        {buildEventsDescription(total, globalTotalData?.total, filterLabels, bounds != null)}
      </p>

      {/* Events list - reuses existing component */}
      <EventsList events={events} isInitialLoad={false} isUpdating={isFetchingNextPage} onEventClick={onEventClick} />

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={handleLoadMore} disabled={isFetchingNextPage} className="min-w-48">
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}

      {/* End of list indicator */}
      {!hasNextPage && events.length > 0 && (
        <div className="text-muted-foreground py-4 text-center text-sm">All {total} events loaded</div>
      )}
    </div>
  );
};

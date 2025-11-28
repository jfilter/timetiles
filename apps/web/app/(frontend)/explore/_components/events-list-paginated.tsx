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

import { Button } from "@timetiles/ui";
import { useCallback } from "react";

import type { FilterState } from "@/lib/filters";
import { type SimpleBounds, useEventsInfiniteFlattened, useEventsTotalQuery } from "@/lib/hooks/use-events-queries";

import { EventsList } from "./events-list";
import { EventsListSkeleton } from "./events-list-skeleton";

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

/** Format dataset names for display */
const formatDatasetNames = (names: string[]): string | null => {
  const first = names[0];
  const second = names[1];
  if (first == null) return null;
  if (second == null) return first;
  if (names.length === 2) return `${first} and ${second}`;
  return `${first}, ${second} and ${names.length - 2} more`;
};

/** Build a natural sentence describing what's being shown */
const buildDescription = (
  visibleCount: number,
  globalTotal: number | undefined,
  datasetNames: string[],
  hasBounds: boolean,
  dateRangeLabel?: string
): string => {
  // Build natural sentences like:
  // "Showing 34 of 1,245 events from Historical Events in the map view, spanning Jan to Dec 2024."
  // "Showing all 200 events from Historical Events."
  // "Showing 500 of 1,245 events in the map view."
  // "Showing all 1,245 events."

  const datasetsText = formatDatasetNames(datasetNames);

  // Determine if map bounds are limiting the results
  const isMapLimiting = hasBounds && globalTotal != null && visibleCount < globalTotal;

  // Start with the count
  let sentence = "Showing ";
  if (isMapLimiting) {
    sentence += `${visibleCount.toLocaleString()} of ${globalTotal.toLocaleString()} events`;
  } else if (globalTotal != null) {
    sentence += `all ${visibleCount.toLocaleString()} events`;
  } else {
    sentence += `${visibleCount.toLocaleString()} event${visibleCount === 1 ? "" : "s"}`;
  }

  // Add dataset filter
  if (datasetsText) {
    sentence += ` from ${datasetsText}`;
  }

  // Add spatial constraint (only when map is actually limiting)
  if (isMapLimiting) {
    sentence += " in the map view";
  }

  // Add date filter
  if (dateRangeLabel) {
    // Make the date range flow naturally
    sentence += `, spanning ${dateRangeLabel.toLowerCase().replace(/^from /, "")}`;
  }

  return sentence + ".";
};

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
      <div className="flex h-64 items-center justify-center">
        <div className="text-destructive">Error loading events: {error?.message ?? "Unknown error"}</div>
      </div>
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
        {buildDescription(total, globalTotalData?.total, datasetNames, bounds != null, dateRangeLabel)}
      </p>

      {/* Events list - reuses existing component */}
      <EventsList events={events} isInitialLoad={false} isUpdating={isFetchingNextPage} onEventClick={onEventClick} />

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={handleLoadMore} disabled={isFetchingNextPage} className="min-w-48">
            {isFetchingNextPage ? (
              <>
                <div className="border-primary mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent" />
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

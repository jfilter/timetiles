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
import { type SimpleBounds, useEventsInfiniteFlattened } from "@/lib/hooks/use-events-queries";

import { EventsList } from "./events-list";
import { EventsListSkeleton } from "./events-list-skeleton";

interface EventsListPaginatedProps {
  filters: FilterState;
  bounds: SimpleBounds | null;
}

export const EventsListPaginated = ({ filters, bounds }: Readonly<EventsListPaginatedProps>) => {
  const { events, total, loadedCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, error } =
    useEventsInfiniteFlattened(filters, bounds, 20);

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
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          Events ({loadedCount} of {total})
        </h2>
      </div>

      {/* Events list - reuses existing component */}
      <EventsList events={events} isInitialLoad={false} isUpdating={isFetchingNextPage} />

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

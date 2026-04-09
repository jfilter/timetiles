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
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useEventsInfiniteFlattened, useEventsTotalQuery } from "@/lib/hooks/use-events-queries";
import type { FilterState } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import type { SimpleBounds } from "@/lib/utils/event-params";

import { EventsList } from "./events-list";
import { EventsListSkeleton } from "./events-list-skeleton";
import { buildEventsDescription, type DateRangeLabel, type FilterLabels, type TranslateFn } from "./explorer-helpers";

interface EventsListPaginatedProps {
  filters: FilterState;
  bounds: SimpleBounds | null;
  /** Selected dataset names for display */
  datasetNames?: string[];
  /** Structured date range label for display */
  dateRangeLabel?: DateRangeLabel;
  /** Callback when an event card is clicked */
  onEventClick?: (eventId: number) => void;
  /** Use responsive multi-column grid instead of single-column stack */
  multiColumn?: boolean;
}

export const EventsListPaginated = ({
  filters,
  bounds,
  datasetNames = [],
  dateRangeLabel,
  onEventClick,
  multiColumn = false,
}: Readonly<EventsListPaginatedProps>) => {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");
  const scope = useViewScope();

  const { events, total, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, error } =
    useEventsInfiniteFlattened(filters, bounds, 20, true, scope);

  // Get global total (without bounds filter) to show "X of Y" when map limits results
  const { data: globalTotalData } = useEventsTotalQuery(filters, true, scope);

  // Track previous event IDs to flash newly appeared events.
  // Lives here (not in EventsList) so the ref persists across loading states.
  const prevEventIdsRef = useRef<Set<number>>(new Set());
  const [_newEventIds, setNewEventIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (events.length === 0) return;
    const prevIds = prevEventIdsRef.current;
    const currentIds = new Set(events.map((e) => e.id));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (prevIds.size > 0) {
      const freshIds = new Set(events.filter((e) => !prevIds.has(e.id)).map((e) => e.id));
      if (freshIds.size > 0) {
        setNewEventIds(freshIds);
        timer = setTimeout(() => setNewEventIds(new Set()), 3000);
      }
    }
    prevEventIdsRef.current = currentIds;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [events]);

  const handleLoadMore = () => {
    void fetchNextPage();
  };

  // Build filter labels for the description
  const filterLabels: FilterLabels = {
    datasets: datasetNames.map((name, idx) => ({ id: String(idx), name })),
    dateRange: dateRangeLabel,
    fieldFilters:
      filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
  };

  // Initial loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="bg-muted h-7 w-32 animate-pulse rounded" />
        </div>
        <EventsListSkeleton count={6} multiColumn={multiColumn} />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <ContentState
        variant="error"
        title={t("failedToLoadEvents")}
        subtitle={error?.message ?? tCommon("error")}
        height={256}
      />
    );
  }

  // Empty state
  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{tCommon("noEventsFound")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header - explains what's being shown */}
      <p className="text-muted-foreground text-sm">
        {buildEventsDescription(total, globalTotalData?.total, filterLabels, bounds != null, (k, v) =>
          (t as TranslateFn)(k, v)
        )}
      </p>

      {/* Events list - reuses existing component */}
      <EventsList
        events={events}
        isInitialLoad={false}
        isUpdating={isFetchingNextPage}
        onEventClick={onEventClick}
        multiColumn={multiColumn}
        hideDatasetBadge={filters.datasets.length === 1}
      />

      {/* Load More button */}
      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={handleLoadMore} disabled={isFetchingNextPage} className="min-w-48">
            {isFetchingNextPage ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon("loading")}
              </>
            ) : (
              tCommon("loadMore")
            )}
          </Button>
        </div>
      )}

      {/* End of list indicator */}
      {!hasNextPage && events.length > 0 && (
        <div className="text-muted-foreground py-4 text-center text-sm">{t("allEventsLoaded", { count: total })}</div>
      )}
    </div>
  );
};

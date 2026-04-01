/**
 * Skeleton loading state for events list.
 *
 * Shows placeholder cards while events are being fetched,
 * matching the EventItem card design for seamless transitions.
 *
 * @module
 * @category Components
 */
import { Card } from "@timetiles/ui";

interface EventsListSkeletonProps {
  count?: number;
  /** Use responsive multi-column grid instead of single-column stack */
  multiColumn?: boolean;
}

export const EventsListSkeleton = ({ count = 6, multiColumn = false }: EventsListSkeletonProps) => {
  return (
    <div className={multiColumn ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
      {Array.from({ length: count }).map((_, index) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key -- static skeleton placeholders have no unique ID
        <Card key={`skeleton-${index}`} className="border-border bg-background border p-3">
          {/* Dataset badge skeleton */}
          <div className="bg-muted h-5 w-20 animate-pulse rounded-sm" />

          {/* Title skeleton */}
          <div className="bg-muted mt-1.5 h-5 w-3/4 animate-pulse rounded" />

          {/* Description skeleton - 2 lines */}
          <div className="mt-1 space-y-1.5">
            <div className="bg-muted h-3.5 w-full animate-pulse rounded" />
            <div className="bg-muted h-3.5 w-2/3 animate-pulse rounded" />
          </div>

          {/* Location and date row skeleton */}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="bg-muted h-4 w-4 animate-pulse rounded" />
              <div className="bg-muted h-4 w-32 animate-pulse rounded" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="bg-muted h-4 w-4 animate-pulse rounded" />
              <div className="bg-muted h-4 w-24 animate-pulse rounded" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

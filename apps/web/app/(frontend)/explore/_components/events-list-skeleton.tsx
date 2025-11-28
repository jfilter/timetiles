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
}

export const EventsListSkeleton = ({ count = 6 }: EventsListSkeletonProps) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="border-border bg-background border-2 p-5">
          {/* Dataset badge skeleton */}
          <div className="bg-muted h-5 w-20 animate-pulse rounded-sm" />

          {/* Title skeleton */}
          <div className="bg-muted mt-3 h-7 w-3/4 animate-pulse rounded" />

          {/* Description skeleton - 2 lines */}
          <div className="mt-2 space-y-2">
            <div className="bg-muted h-4 w-full animate-pulse rounded" />
            <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          </div>

          {/* Location and date row skeleton */}
          <div className="mt-4 flex items-center justify-between">
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

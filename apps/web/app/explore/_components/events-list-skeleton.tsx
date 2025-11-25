/**
 * Skeleton loading state for events list.
 *
 * Shows placeholder cards while events are being fetched,
 * providing better perceived performance during initial load.
 *
 * @module
 * @category Components
 */
import { Card, CardContent, CardHeader } from "@timetiles/ui";

interface EventsListSkeletonProps {
  count?: number;
}

export const EventsListSkeleton = ({ count = 6 }: EventsListSkeletonProps) => {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} variant="showcase" padding="lg">
          {/* Version badge skeleton */}
          <div className="bg-muted mb-2 h-3 w-16 animate-pulse rounded" />

          <CardHeader>
            {/* Title skeleton */}
            <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
            {/* Description skeleton */}
            <div className="mt-2 space-y-2">
              <div className="bg-muted h-4 w-full animate-pulse rounded" />
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
            </div>
          </CardHeader>

          <CardContent>
            {/* Spec items skeleton */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-muted h-16 animate-pulse rounded-sm" />
              <div className="bg-muted h-16 animate-pulse rounded-sm [animation-delay:100ms]" />
              <div className="bg-muted h-16 animate-pulse rounded-sm [animation-delay:200ms]" />
              <div className="bg-muted h-16 animate-pulse rounded-sm [animation-delay:300ms]" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

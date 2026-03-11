/**
 * Loading skeleton for event detail content.
 *
 * @module
 * @category Components
 */

/** Animated placeholder skeleton shown while event detail data loads */
export const EventDetailSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="space-y-3">
      <div className="bg-muted h-5 w-24 rounded-sm" />
      <div className="bg-muted h-8 w-3/4 rounded" />
    </div>
    <div className="space-y-2">
      <div className="bg-muted h-4 w-full rounded" />
      <div className="bg-muted h-4 w-5/6 rounded" />
    </div>
    <div className="bg-muted h-5 w-full rounded" />
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-muted h-14 min-w-[140px] flex-1 rounded-sm" />
      ))}
    </div>
  </div>
);

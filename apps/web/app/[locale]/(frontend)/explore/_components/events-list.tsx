/**
 * List component for displaying event items.
 *
 * Renders a scrollable list of events with dataset badge, title, description,
 * and location/date row with icons. Variant C design.
 *
 * @module
 * @category Components
 */
import { Card, CardDescription, CardTitle, ContentState } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Calendar, MapPin } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";

import { getDatasetBadgeClass } from "@/lib/constants/dataset-colors";
import type { EventListItem } from "@/lib/schemas/events";
import {
  extractEventFields,
  formatDateRange,
  getDatasetInfo,
  getEventData,
  getLocationDisplay,
} from "@/lib/utils/event-detail";

import { EventsListSkeleton } from "./events-list-skeleton";

interface EventsListProps {
  events: EventListItem[];
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  /** Error from data fetch */
  error?: Error | null;
  /** Callback to retry the failed fetch */
  onRetry?: () => void;
  /** Callback when an event card is clicked */
  onEventClick?: (eventId: number) => void;
  /** Use responsive multi-column grid instead of single-column stack */
  multiColumn?: boolean;
}

interface EventItemProps {
  event: EventListItem;
  eventId: number;
  onEventClick?: (eventId: number) => void;
}

const EventItem = ({ event, eventId, onEventClick }: EventItemProps) => {
  const locale = useLocale();
  const eventData = getEventData(event);
  const { title, description: rawDescription } = extractEventFields(eventData);
  const description = rawDescription ?? "";
  const datasetInfo = getDatasetInfo(event.dataset);
  const locationDisplay = getLocationDisplay(event);
  const eventDate = formatDateRange(event.eventTimestamp, event.eventEndTimestamp, locale);

  const handleClick = () => {
    if (onEventClick) {
      onEventClick(eventId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && onEventClick) {
      e.preventDefault();
      onEventClick(eventId);
    }
  };

  const badgeClass = getDatasetBadgeClass(datasetInfo?.id ?? null);

  // Find first image URL in event data
  const imageUrl =
    Object.values(eventData).find(
      (v): v is string => typeof v === "string" && /^https?:\/\/.+\.(jpe?g|png|gif|svg|webp)/i.test(v)
    ) ?? null;

  return (
    <Card
      className={cn(
        "border-border bg-background overflow-hidden border",
        onEventClick && "hover:border-ring cursor-pointer transition-colors duration-200",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      )}
      onClick={onEventClick ? handleClick : undefined}
      onKeyDown={onEventClick ? handleKeyDown : undefined}
      role={onEventClick ? "button" : undefined}
      tabIndex={onEventClick ? 0 : undefined}
      aria-label={onEventClick ? `View details for ${title}` : undefined}
    >
      {/* Thumbnail */}
      {imageUrl && (
        <Image src={imageUrl} alt="" width={400} height={96} className="h-24 w-full object-cover" unoptimized />
      )}

      <div className="p-3">
        {/* Dataset badge */}
        {datasetInfo && (
          <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", badgeClass)}>
            {datasetInfo.name}
          </span>
        )}

        {/* Title */}
        <CardTitle className={cn("text-base font-semibold", datasetInfo && "mt-1.5")}>{title}</CardTitle>

        {/* Description - 2 line clamp */}
        {description && (
          <CardDescription className="mt-1 line-clamp-2 text-sm leading-normal">{description}</CardDescription>
        )}

        {/* Location and Date row with icons */}
        {(locationDisplay != null || eventDate != null) && (
          <div className="text-muted-foreground mt-2 flex items-center justify-between text-sm">
            {locationDisplay && (
              <div className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{locationDisplay}</span>
              </div>
            )}
            {eventDate && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{eventDate}</span>
              </div>
            )}
          </div>
        )}

        {/* Tag chips — skip arrays where elements look like URLs */}
        {(() => {
          const tags = Object.values(eventData).flatMap((v) => {
            if (!Array.isArray(v)) return [];
            const strings = v.filter((t): t is string => typeof t === "string" && t !== "");
            const urlCount = strings.filter((s) => /^https?:\/\//i.test(s)).length;
            return urlCount > strings.length * 0.5 ? [] : strings;
          });
          return tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.slice(0, 6).map((tag) => (
                <span key={tag} className="bg-muted dark:bg-muted/60 rounded-sm px-1.5 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
              {tags.length > 6 && <span className="text-muted-foreground px-1 py-0.5 text-xs">+{tags.length - 6}</span>}
            </div>
          ) : null;
        })()}
      </div>
    </Card>
  );
};

export const EventsList = ({
  events,
  isInitialLoad = false,
  isUpdating = false,
  error,
  onRetry,
  onEventClick,
  multiColumn = false,
}: Readonly<EventsListProps>) => {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");

  if (isInitialLoad) {
    return <EventsListSkeleton count={6} multiColumn={multiColumn} />;
  }

  if (error) {
    return (
      <ContentState
        variant="error"
        title={t("failedToLoadEvents")}
        subtitle={error.message ?? tCommon("error")}
        onRetry={onRetry}
        height={256}
      />
    );
  }

  if (events.length === 0 && !isUpdating) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">{tCommon("noEventsFound")}</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {isUpdating && (
        <div className="absolute top-0 right-0 z-10">
          <div className="bg-background/80 flex items-center gap-2 rounded-md border px-3 py-1 text-xs backdrop-blur-sm">
            <div className="border-primary h-3 w-3 animate-spin rounded-full border-b-2" />
            <span className="text-muted-foreground">{tCommon("updating")}</span>
          </div>
        </div>
      )}
      <div
        className={cn(
          "transition-opacity",
          isUpdating ? "opacity-90" : "opacity-100",
          multiColumn ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2"
        )}
      >
        {events.map((event) => (
          <EventItem key={event.id} event={event} eventId={event.id} onEventClick={onEventClick} />
        ))}
      </div>
    </div>
  );
};

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
import { useTranslations } from "next-intl";

import { getDatasetBadgeClass } from "@/lib/constants/dataset-colors";
import type { EventListItem } from "@/lib/schemas/events";
import {
  formatDateRange,
  getDatasetInfo,
  getEventData,
  getEventTitle,
  getLocationDisplay,
  safeToString,
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
}

interface EventItemProps {
  event: EventListItem;
  eventId: number;
  onEventClick?: (eventId: number) => void;
}

const EventItem = ({ event, eventId, onEventClick }: EventItemProps) => {
  const eventData = getEventData(event);
  const title = getEventTitle(eventData);
  const description = safeToString(eventData.description);
  const datasetInfo = getDatasetInfo(event.dataset);
  const locationDisplay = getLocationDisplay(event, eventData);
  const dateRange = formatDateRange(eventData.startDate, eventData.endDate);

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

  return (
    <Card
      className={cn(
        "border-border bg-background border-2 p-5",
        onEventClick && "hover:border-cartographic-blue cursor-pointer transition-colors duration-200",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      )}
      onClick={onEventClick ? handleClick : undefined}
      onKeyDown={onEventClick ? handleKeyDown : undefined}
      role={onEventClick ? "button" : undefined}
      tabIndex={onEventClick ? 0 : undefined}
      aria-label={onEventClick ? `View details for ${title}` : undefined}
    >
      {/* Dataset badge */}
      {datasetInfo && (
        <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", badgeClass)}>
          {datasetInfo.name}
        </span>
      )}

      {/* Title */}
      <CardTitle className={cn("text-xl", datasetInfo && "mt-3")}>{title}</CardTitle>

      {/* Description - 2 line clamp */}
      {description && <CardDescription className="mt-2 line-clamp-2">{description}</CardDescription>}

      {/* Location and Date row with icons */}
      {(locationDisplay != null || dateRange != null) && (
        <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
          {locationDisplay && (
            <div className="flex min-w-0 items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{locationDisplay}</span>
            </div>
          )}
          {dateRange && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{dateRange}</span>
            </div>
          )}
        </div>
      )}
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
}: Readonly<EventsListProps>) => {
  const t = useTranslations("Explore");
  const tCommon = useTranslations("Common");

  if (isInitialLoad) {
    return <EventsListSkeleton count={6} />;
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
      <div className={`space-y-4 transition-opacity ${isUpdating ? "opacity-90" : "opacity-100"}`}>
        {events.map((event) => (
          <EventItem key={event.id} event={event} eventId={event.id} onEventClick={onEventClick} />
        ))}
      </div>
    </div>
  );
};

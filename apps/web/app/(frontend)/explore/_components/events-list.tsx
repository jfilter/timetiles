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
import { useCallback } from "react";

import type { Event } from "@/payload-types";

import { EventsListSkeleton } from "./events-list-skeleton";

interface EventsListProps {
  events: Event[];
  isInitialLoad?: boolean;
  isUpdating?: boolean;
  /** Error from data fetch */
  error?: Error | null;
  /** Callback to retry the failed fetch */
  onRetry?: () => void;
  /** Callback when an event card is clicked */
  onEventClick?: (eventId: number) => void;
}

const safeToString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
};

interface EventData {
  title?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  [key: string]: unknown;
}

const getEventData = (event: Event): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

const getDatasetInfo = (dataset: unknown): { name: string; id: number } | null => {
  if (typeof dataset === "object" && dataset != null) {
    const d = dataset as Record<string, unknown>;
    // API returns 'title', Payload returns 'name'
    let name: string | null = null;
    if (typeof d.title === "string") {
      name = d.title;
    } else if (typeof d.name === "string") {
      name = d.name;
    }
    const id = typeof d.id === "number" ? d.id : null;
    if (name && id !== null) {
      return { name, id };
    }
  }
  return null;
};

const getLocationDisplay = (event: Event, eventData: EventData): string | null => {
  // Prefer location name (venue, place name) if available
  if (event.locationName) {
    return event.locationName;
  }
  // Fall back to geocoded/normalized address
  if (event.geocodingInfo?.normalizedAddress) {
    return event.geocodingInfo.normalizedAddress;
  }
  // Final fallback to city/country from data
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

const formatDateRange = (startDate: unknown, endDate: unknown): string => {
  const hasStart = startDate != null && safeToString(startDate) !== "";
  const hasEnd = endDate != null && safeToString(endDate) !== "";

  if (!hasStart && !hasEnd) return "";

  const parts: string[] = [];
  if (hasStart) {
    parts.push(new Date(safeToString(startDate)).toLocaleDateString("en-US"));
  }
  if (hasEnd && safeToString(startDate) !== safeToString(endDate)) {
    parts.push(new Date(safeToString(endDate)).toLocaleDateString("en-US"));
  }

  return parts.join(" - ");
};

// Dataset badge colors - assigned by ID so first datasets get best colors
const DATASET_BADGE_COLORS = [
  "bg-cartographic-blue/10 text-cartographic-blue",
  "bg-cartographic-terracotta/10 text-cartographic-terracotta",
  "bg-cartographic-forest/10 text-cartographic-forest",
  "bg-cartographic-teal/10 text-cartographic-teal",
  "bg-cartographic-amber/10 text-cartographic-amber",
  "bg-cartographic-plum/10 text-cartographic-plum",
  "bg-cartographic-rose/10 text-cartographic-rose",
  "bg-cartographic-olive/10 text-cartographic-olive",
  "bg-cartographic-navy/10 text-cartographic-navy",
  "bg-cartographic-slate/10 text-cartographic-slate",
] as const;

const getDatasetBadgeClass = (datasetId: number | null): string => {
  // Use ID directly - dataset 1 gets color 0, dataset 2 gets color 1, etc.
  const index = datasetId === null ? 0 : (datasetId - 1) % DATASET_BADGE_COLORS.length;
  // Index is always valid since we use modulo with array length
  return DATASET_BADGE_COLORS[index] ?? DATASET_BADGE_COLORS[0];
};

interface EventItemProps {
  event: Event;
  eventId: number;
  onEventClick?: (eventId: number) => void;
}

const EventItem = ({ event, eventId, onEventClick }: EventItemProps) => {
  const eventData = getEventData(event);
  const title = safeToString(eventData.title) || safeToString(eventData.name) || "Untitled Event";
  const description = safeToString(eventData.description);
  const datasetInfo = getDatasetInfo(event.dataset);
  const locationDisplay = getLocationDisplay(event, eventData);
  const dateRange = formatDateRange(eventData.startDate, eventData.endDate);

  const handleClick = useCallback(() => {
    if (onEventClick) {
      onEventClick(eventId);
    }
  }, [onEventClick, eventId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === "Enter" || e.key === " ") && onEventClick) {
        e.preventDefault();
        onEventClick(eventId);
      }
    },
    [onEventClick, eventId]
  );

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
      {(locationDisplay != null || dateRange !== "") && (
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
  if (isInitialLoad) {
    return <EventsListSkeleton count={6} />;
  }

  if (error) {
    return (
      <ContentState
        variant="error"
        title="Failed to load events"
        subtitle={error.message ?? "Something went wrong"}
        onRetry={onRetry}
        height={256}
      />
    );
  }

  if (events.length === 0 && !isUpdating) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  return (
    <div className="relative">
      {isUpdating && (
        <div className="absolute top-0 right-0 z-10">
          <div className="bg-background/80 flex items-center gap-2 rounded-md border px-3 py-1 text-xs backdrop-blur-sm">
            <div className="border-primary h-3 w-3 animate-spin rounded-full border-b-2" />
            <span className="text-muted-foreground">Updating...</span>
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

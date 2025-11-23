/**
 * List component for displaying event items.
 *
 * Renders a scrollable list of events with title, date, location, and
 * description. Includes loading states and empty state handling.
 * Used in the explore page sidebar for browsing events.
 *
 * @module
 * @category Components
 */
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardSpec,
  CardSpecItem,
  CardTitle,
  CardVersion,
} from "@timetiles/ui";

import type { Event } from "@/payload-types";

interface EventsListProps {
  events: Event[];
  isInitialLoad?: boolean;
  isUpdating?: boolean;
}

const safeToString = (value: unknown): string => {
  if (value == null || value == undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // For objects and arrays, return empty string to avoid [object Object]
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

// Helper functions to reduce complexity
const getEventData = (event: Event): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

const getDatasetName = (dataset: unknown): string | null => {
  if (typeof dataset === "object" && dataset != null && "name" in dataset) {
    return String(dataset.name);
  }
  return null;
};

const getLocationDisplay = (event: Event, eventData: EventData): string | null => {
  if (event.geocodingInfo?.normalizedAddress) {
    return event.geocodingInfo.normalizedAddress;
  }
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

const formatDateRange = (startDate: unknown, endDate: unknown): string => {
  const hasStart = startDate != null;
  const hasEnd = endDate != null;

  if (!hasStart && !hasEnd) return "";

  const parts: string[] = [];
  if (hasStart) {
    parts.push(new Date(safeToString(startDate)).toLocaleDateString("en-US"));
  }
  if (hasEnd) {
    parts.push(new Date(safeToString(endDate)).toLocaleDateString("en-US"));
  }

  return parts.join(" - ");
};

const EventItem = ({ event, index }: { event: Event; index: number }) => {
  const eventData = getEventData(event);
  const title = safeToString(eventData.title);
  const datasetName = getDatasetName(event.dataset);
  const locationDisplay = getLocationDisplay(event, eventData);

  const hasDateRange = eventData.startDate != null || eventData.endDate != null;
  const hasCoordinates =
    event.location?.latitude != null &&
    event.location.latitude !== 0 &&
    event.location?.longitude != null &&
    event.location.longitude !== 0;

  return (
    <Card variant="showcase" padding="lg">
      <CardVersion>Event #{index + 1}</CardVersion>

      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {eventData.description && (
          <CardDescription className="line-clamp-3">{safeToString(eventData.description)}</CardDescription>
        )}
      </CardHeader>

      <CardContent>
        <CardSpec>
          {hasDateRange && (
            <CardSpecItem label="Date">{formatDateRange(eventData.startDate, eventData.endDate)}</CardSpecItem>
          )}

          {locationDisplay && <CardSpecItem label="Location">{locationDisplay}</CardSpecItem>}

          {hasCoordinates && (
            <CardSpecItem label="Coordinates">
              <span className="font-mono text-xs">
                {event.location!.latitude!.toFixed(4)}, {event.location!.longitude!.toFixed(4)}
              </span>
            </CardSpecItem>
          )}

          {datasetName && <CardSpecItem label="Dataset">{datasetName}</CardSpecItem>}
        </CardSpec>
      </CardContent>
    </Card>
  );
};

export const EventsList = ({ events, isInitialLoad = false, isUpdating = false }: Readonly<EventsListProps>) => {
  // Only show full loading state on initial load
  if (isInitialLoad) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading events...</div>
      </div>
    );
  }

  if (events.length === 0 && !isUpdating) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  // Show events with subtle loading indicator when updating
  return (
    <div className="relative">
      {isUpdating && (
        <div className="absolute right-0 top-0 z-10">
          <div className="bg-background/80 flex items-center gap-2 rounded-md border px-3 py-1 text-xs backdrop-blur-sm">
            <div className="border-primary h-3 w-3 animate-spin rounded-full border-b-2" />
            <span className="text-muted-foreground">Updating...</span>
          </div>
        </div>
      )}
      <div className={`space-y-4 transition-opacity ${isUpdating ? "opacity-90" : "opacity-100"}`}>
        {events.map((event, index) => (
          <EventItem key={event.id} event={event} index={index} />
        ))}
      </div>
    </div>
  );
};

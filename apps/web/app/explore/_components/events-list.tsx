/**
 * List component for displaying event items.
 *
 * Renders a scrollable list of events using intelligent field detection
 * based on dataset schema metadata. Includes loading states and empty state handling.
 * Used in the explore page sidebar for browsing events.
 *
 * @module
 * @category Components
 */
import { formatEventForDisplay } from "@/lib/utils/event-display-formatter";
import type { Event } from "@/payload-types";

interface EventsListProps {
  events: Event[];
  isInitialLoad?: boolean;
  isUpdating?: boolean;
}

interface FieldMetadata {
  [key: string]: {
    path: string;
    occurrences: number;
    occurrencePercent: number;
    uniqueValues?: number;
    typeDistribution?: Record<string, number>;
    formats?: Record<string, number>;
  };
}

const getEventData = (event: Event): Record<string, unknown> => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as Record<string, unknown>)
    : {};
};

const getFieldMetadata = (event: Event): FieldMetadata | null => {
  if (typeof event.dataset === "object" && event.dataset != null) {
    const fieldMetadata = event.dataset.fieldMetadata;
    if (fieldMetadata && typeof fieldMetadata === "object") {
      return fieldMetadata as FieldMetadata;
    }
  }
  return null;
};

const EventDataFields = ({ fields }: { fields: Array<{ key: string; value: string }> }) => {
  if (fields.length === 0) return null;

  return (
    <div className="text-muted-foreground mt-2 space-y-1 text-sm">
      {fields.map(({ key, value }) => (
        <div key={key} className="flex gap-2">
          <span className="font-medium">{key}:</span>
          <span className="truncate">{value}</span>
        </div>
      ))}
    </div>
  );
};

const EventLocation = ({ event }: { event: Event }) => {
  const hasNormalizedAddress =
    event.geocodingInfo?.normalizedAddress != null && event.geocodingInfo.normalizedAddress !== "";

  if (!hasNormalizedAddress) return null;

  return <div className="text-muted-foreground mt-1 text-sm">{event.geocodingInfo?.normalizedAddress}</div>;
};

const EventCoordinates = ({ location }: { location?: { latitude?: number | null; longitude?: number | null } }) => {
  if (location?.latitude == null || location.latitude === 0 || location?.longitude == null || location.longitude === 0)
    return null;

  return (
    <div className="text-muted-foreground mt-1 text-xs">
      {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
    </div>
  );
};

const EventItem = ({ event }: { event: Event }) => {
  const eventData = getEventData(event);
  const fieldMetadata = getFieldMetadata(event);

  // Get display config from dataset if available
  const displayConfig =
    typeof event.dataset === "object" && event.dataset != null && typeof event.dataset.displayConfig === "object"
      ? event.dataset.displayConfig
      : null;

  // Use the formatter to intelligently extract display info
  const displayInfo = formatEventForDisplay(eventData, fieldMetadata, event.id, displayConfig as never);

  return (
    <div key={event.id} className="hover:bg-accent/50 rounded-lg border p-4 transition-colors">
      <h3 className="text-lg font-semibold">{displayInfo.primaryLabel}</h3>
      <EventDataFields fields={displayInfo.fields} />
      <EventLocation event={event} />
      <EventCoordinates location={event.location} />
    </div>
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
      <div className={`space-y-2 transition-opacity ${isUpdating ? "opacity-90" : "opacity-100"}`}>
        {events.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
};

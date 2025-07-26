import type { Event } from "../payload-types";

interface EventsListProps {
  events: Event[];
  loading?: boolean;
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
  title?: unknown;
  name?: unknown;
  description?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  city?: unknown;
  country?: unknown;
}

// Helper functions to reduce complexity
const getEventData = (event: Event): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

const getEventTitle = (eventData: EventData, eventId: string): string => {
  return safeToString(eventData.title) || safeToString(eventData.name) || `Event ${eventId}`;
};

const EventDescription = ({ description }: { description?: unknown }) => {
  if (description == null || description === "") return null;
  return <p className="text-muted-foreground mt-1 text-sm">{safeToString(description)}</p>;
};

const EventDateRange = ({ startDate, endDate }: { startDate?: unknown; endDate?: unknown }) => {
  const hasStartDate = startDate != null;
  const hasEndDate = endDate != null;
  const hasBothDates = hasStartDate && hasEndDate;

  if (!hasStartDate && !hasEndDate) return null;

  return (
    <div className="text-muted-foreground mt-2 text-sm">
      {hasStartDate && <span>{new Date(safeToString(startDate)).toLocaleDateString()}</span>}
      {hasBothDates && <span> - </span>}
      {hasEndDate && <span>{new Date(safeToString(endDate)).toLocaleDateString()}</span>}
    </div>
  );
};

const EventLocation = ({ event, eventData }: { event: Event; eventData: EventData }) => {
  const hasNormalizedAddress =
    event.geocodingInfo?.normalizedAddress != null && event.geocodingInfo.normalizedAddress !== "";
  const hasLocationData = eventData.city != null || eventData.country != null;

  if (!hasNormalizedAddress && !hasLocationData) return null;

  const displayAddress = hasNormalizedAddress
    ? event.geocodingInfo?.normalizedAddress
    : [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean).join(", ");

  return <div className="text-muted-foreground mt-1 text-sm">{displayAddress}</div>;
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
  const title = getEventTitle(eventData, String(event.id));

  return (
    <div key={event.id} className="hover:bg-accent/50 rounded-lg border p-4 transition-colors">
      <h3 className="text-lg font-semibold">{title}</h3>
      <EventDescription description={eventData.description} />
      <EventDateRange startDate={eventData.startDate} endDate={eventData.endDate} />
      <EventLocation event={event} eventData={eventData} />
      <EventCoordinates location={event.location} />
    </div>
  );
};

export const EventsList = ({ events, loading }: Readonly<EventsListProps>) => {
  if (loading === true) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading events...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <EventItem key={event.id} event={event} />
      ))}
    </div>
  );
};

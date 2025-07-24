import type { Event } from "../payload-types";

interface EventsListProps {
  events: Event[];
  loading?: boolean;
}

function safeToString(value: unknown): string {
  if (value === null || value === undefined) {
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
}

export function EventsList({ events, loading }: EventsListProps) {
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
      {events.map((event) => {
        interface EventData {
          title?: unknown;
          name?: unknown;
          description?: unknown;
          startDate?: unknown;
          endDate?: unknown;
          city?: unknown;
          country?: unknown;
        }

        const eventData: EventData =
          typeof event.data === "object" &&
          event.data !== null &&
          !Array.isArray(event.data)
            ? (event.data as EventData)
            : {};

        return (
          <div
            key={event.id}
            className="hover:bg-accent/50 rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-lg font-semibold">
              {safeToString(eventData.title) ||
                safeToString(eventData.name) ||
                `Event ${event.id}`}
            </h3>
            {eventData.description !== undefined &&
            eventData.description !== null &&
            eventData.description !== "" ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {safeToString(eventData.description)}
              </p>
            ) : null}
            <div className="text-muted-foreground mt-2 text-sm">
              {eventData.startDate !== undefined &&
              eventData.startDate !== null ? (
                <span>
                  {new Date(
                    safeToString(eventData.startDate),
                  ).toLocaleDateString()}
                </span>
              ) : null}
              {eventData.startDate !== undefined &&
              eventData.startDate !== null &&
              eventData.endDate !== undefined &&
              eventData.endDate !== null ? (
                <span> - </span>
              ) : null}
              {eventData.endDate !== undefined && eventData.endDate !== null ? (
                <span>
                  {new Date(
                    safeToString(eventData.endDate),
                  ).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            {(eventData.city !== undefined && eventData.city !== null) ||
            (eventData.country !== undefined && eventData.country !== null) ||
            (event.geocodingInfo?.normalizedAddress !== undefined &&
              event.geocodingInfo?.normalizedAddress !== null &&
              event.geocodingInfo?.normalizedAddress !== "") ? (
              <div className="text-muted-foreground mt-1 text-sm">
                {event.geocodingInfo?.normalizedAddress ??
                  [eventData.city, eventData.country]
                    .filter(Boolean)
                    .join(", ")}
              </div>
            ) : null}
            {event.location ? (
              <div className="text-muted-foreground mt-1 text-xs">
                {event.location.latitude?.toFixed(4)},{" "}
                {event.location.longitude?.toFixed(4)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

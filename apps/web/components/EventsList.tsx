import type { Event } from "../payload-types";

interface EventsListProps {
  events: Event[];
  loading?: boolean;
}

export function EventsList({ events, loading }: EventsListProps) {
  if (loading) {
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
        const eventData =
          typeof event.data === "object" &&
          event.data !== null &&
          !Array.isArray(event.data)
            ? (event.data as Record<string, unknown>)
            : {};

        return (
          <div
            key={event.id}
            className="hover:bg-accent/50 rounded-lg border p-4 transition-colors"
          >
            <h3 className="text-lg font-semibold">
              {String(eventData.title ?? eventData.name ?? `Event ${event.id}`)}
            </h3>
            {eventData.description ? (
              <p className="text-muted-foreground mt-1 text-sm">
                {String(eventData.description)}
              </p>
            ) : null}
            <div className="text-muted-foreground mt-2 text-sm">
              {eventData.startDate ? (
                <span>
                  {new Date(String(eventData.startDate)).toLocaleDateString()}
                </span>
              ) : null}
              {eventData.startDate && eventData.endDate ? (
                <span> - </span>
              ) : null}
              {eventData.endDate ? (
                <span>
                  {new Date(String(eventData.endDate)).toLocaleDateString()}
                </span>
              ) : null}
            </div>
            {eventData.city ||
            eventData.country ||
            event.geocodingInfo?.normalizedAddress ? (
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

import type { Event } from "../payload-types";

interface EventsListProps {
  events: Event[];
  loading?: boolean;
}

export function EventsList({ events, loading }: EventsListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading events...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const eventData = typeof event.data === 'object' && event.data !== null && !Array.isArray(event.data) 
          ? event.data as Record<string, unknown>
          : {};
        
        return (
          <div
            key={event.id}
            className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
          >
            <h3 className="font-semibold text-lg">
              {String(eventData.title || eventData.name || `Event ${event.id}`)}
            </h3>
            {eventData.description ? (
              <p className="text-sm text-muted-foreground mt-1">{String(eventData.description)}</p>
            ) : null}
            <div className="mt-2 text-sm text-muted-foreground">
              {eventData.startDate ? (
                <span>{new Date(String(eventData.startDate)).toLocaleDateString()}</span>
              ) : null}
              {eventData.startDate && eventData.endDate ? <span> - </span> : null}
              {eventData.endDate ? (
                <span>{new Date(String(eventData.endDate)).toLocaleDateString()}</span>
              ) : null}
            </div>
            {(eventData.city || eventData.country || event.geocodingInfo?.normalizedAddress) ? (
              <div className="mt-1 text-sm text-muted-foreground">
                {event.geocodingInfo?.normalizedAddress || 
                 [eventData.city, eventData.country].filter(Boolean).join(", ")}
              </div>
            ) : null}
            {event.location ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {event.location.latitude?.toFixed(4)}, {event.location.longitude?.toFixed(4)}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
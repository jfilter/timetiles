/**
 * Event detail modal component for the explore page.
 *
 * Displays full event details in a modal overlay when clicking on an
 * event card. Uses URL state for permalinks support.
 *
 * @module
 * @category Components
 */
"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { useCallback, useMemo } from "react";

import { EventDetailContent, EventDetailError, EventDetailSkeleton } from "@/components/events";
import { useEventDetailQuery } from "@/lib/hooks/use-events-queries";

interface EventDetailModalProps {
  /** The event ID to display, or null if closed */
  eventId: number | null;
  /** Callback when the modal is closed */
  onClose: () => void;
}

// Helper to extract event title for accessibility
const getEventTitle = (event: { data?: unknown }): string => {
  const data = event.data as Record<string, unknown> | undefined;
  if (data && typeof data.title === "string" && data.title) {
    return data.title;
  }
  if (data && typeof data.name === "string" && data.name) {
    return data.name;
  }
  return "Untitled Event";
};

export const EventDetailModal = ({ eventId, onClose }: EventDetailModalProps) => {
  const isOpen = eventId !== null;

  const { data: event, isLoading, error, refetch } = useEventDetailQuery(eventId);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );

  const handleRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Compute dialog title without nested ternary
  const dialogTitle = useMemo(() => {
    if (isLoading) return "Loading event details";
    if (event) return `Event: ${getEventTitle(event)}`;
    return "Event details";
  }, [isLoading, event]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="wide"
        showCloseButton={false}
        className={cn(
          // Desktop: centered modal
          "md:max-w-2xl",
          // Mobile: larger modal, more space
          "max-md:max-h-[90vh] max-md:max-w-[calc(100%-2rem)]"
        )}
        aria-describedby="event-detail-description"
      >
        {/* Screen reader accessible title */}
        <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
        <DialogDescription id="event-detail-description" className="sr-only">
          Detailed information about the selected event including location, dates, and additional data.
        </DialogDescription>

        {/* Content */}
        {isLoading && <EventDetailSkeleton />}
        {error && <EventDetailError error={error} onRetry={handleRetry} />}
        {event && !isLoading && !error && <EventDetailContent event={event} variant="modal" onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
};

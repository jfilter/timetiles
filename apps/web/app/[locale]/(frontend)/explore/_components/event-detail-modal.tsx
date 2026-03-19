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
import { useTranslations } from "next-intl";

import { EventDetailContent, EventDetailError, EventDetailSkeleton } from "@/components/events";
import { useEventDetailQuery } from "@/lib/hooks/use-events-queries";
import { getEventData, getEventTitle } from "@/lib/utils/event-detail";

interface EventDetailModalProps {
  /** The event ID to display, or null if closed */
  eventId: number | null;
  /** Callback when the modal is closed */
  onClose: () => void;
}

export const EventDetailModal = ({ eventId, onClose }: EventDetailModalProps) => {
  const t = useTranslations("Events");
  const isOpen = eventId !== null;

  const { data: event, isLoading, error, refetch } = useEventDetailQuery(eventId);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  const handleRetry = () => {
    void refetch();
  };

  // Compute dialog title using dataset field mappings for correct extraction
  const dialogTitle = (() => {
    if (isLoading) return t("loadingEventDetails");
    if (event) {
      const fieldMappings =
        typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;
      return getEventTitle(getEventData(event), fieldMappings);
    }
    return t("eventDetails");
  })();

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
          {t("eventDescription")}
        </DialogDescription>

        {/* Content */}
        {isLoading && <EventDetailSkeleton />}
        {error && <EventDetailError error={error} onRetry={handleRetry} />}
        {event && !isLoading && !error && <EventDetailContent event={event} variant="modal" onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
};

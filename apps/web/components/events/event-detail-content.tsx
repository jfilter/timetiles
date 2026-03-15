/**
 * Shared event detail content component.
 *
 * Displays comprehensive event information with dataset badge, title,
 * description, location/date row with icons, and flexible attribute boxes.
 * Variant C design matching the card list style.
 *
 * @module
 * @category Components
 */
/* oxlint-disable complexity -- Event detail rendering has many conditional display sections */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Calendar, ExternalLink, MapPin, X } from "lucide-react";
import Link from "next/link";

import { useMemo } from "react";

import { getDatasetBadgeClass } from "@/lib/constants/dataset-colors";
import { formatDate } from "@/lib/utils/date";
import {
  formatDateRange,
  getDatasetInfo,
  getEventData,
  getEventTitle,
  getLocationDisplay,
  hasValidCoordinates,
  safeToString,
} from "@/lib/utils/event-detail";
import type { Event } from "@/payload-types";

import { EventDetailError } from "./event-detail-error";
import { EventDetailSkeleton } from "./event-detail-skeleton";
import { EventMetadataCard } from "./event-metadata-card";
import { FieldBox } from "./field-box";
import { ShareButton } from "./share-button";

export type { EventDetailContentProps };
export { EventDetailError, EventDetailSkeleton };

interface EventDetailContentProps {
  /** The event data to display */
  event: Event;
  /** Variant: 'modal' shows close/share actions, 'page' shows different layout */
  variant?: "modal" | "page";
  /** Callback when close button is clicked (modal variant only) */
  onClose?: () => void;
  /** Whether to show the loading state */
  isLoading?: boolean;
  /** Error to display */
  error?: Error | null;
  /** Retry callback for error state */
  onRetry?: () => void;
}

export const EventDetailContent = ({
  event,
  variant = "modal",
  onClose,
  isLoading,
  error,
  onRetry,
}: EventDetailContentProps) => {
  // Get additional data fields (excluding known fields)
  const knownFields = useMemo(
    () => new Set(["title", "name", "description", "startDate", "endDate", "city", "country", "id"]),
    []
  );

  // Show loading state
  if (isLoading) {
    return <EventDetailSkeleton />;
  }

  // Show error state
  if (error) {
    return <EventDetailError error={error} onRetry={onRetry} />;
  }

  const eventData = getEventData(event);
  const title = getEventTitle(eventData);
  const description = safeToString(eventData.description);
  const dateRange = formatDateRange(eventData.startDate, eventData.endDate);
  const locationDisplay = getLocationDisplay(event, eventData);
  const datasetInfo = getDatasetInfo(event.dataset);

  const hasCoordinates = hasValidCoordinates(event.location);
  const badgeClass = getDatasetBadgeClass(datasetInfo?.id ?? null);

  const additionalFields = Object.entries(eventData).filter(
    ([key, value]) => !knownFields.has(key) && value != null && safeToString(value) !== ""
  );

  return (
    <div className={cn("space-y-5", variant === "page" && "mx-auto max-w-4xl")}>
      {/* Header with badge + action icons */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Dataset badge */}
          {datasetInfo && (
            <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", badgeClass)}>
              {datasetInfo.name}
            </span>
          )}
          {/* Title */}
          <h2 className={cn("font-serif text-2xl leading-tight font-bold", datasetInfo && "mt-3")}>{title}</h2>
        </div>

        {/* Action icons */}
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          <ShareButton title={title} />
          {variant === "modal" && (
            <>
              <Button variant="ghost" size="icon" className="hover:bg-muted" asChild>
                <Link href={`/events/${event.id}`} target="_blank" aria-label="Open in new tab">
                  <ExternalLink className="h-5 w-5" />
                </Link>
              </Button>
              {onClose && (
                <Button variant="ghost" size="icon" className="hover:bg-muted" onClick={onClose} aria-label="Close">
                  <X className="h-5 w-5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Description */}
      {description && <p className="text-muted-foreground leading-relaxed">{description}</p>}

      {/* Location and date - one row with icons */}
      {(locationDisplay != null || dateRange != null) && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          {locationDisplay && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{locationDisplay}</span>
            </div>
          )}
          {dateRange && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{dateRange}</span>
            </div>
          )}
        </div>
      )}

      {/* All fields in flexible boxes */}
      <div className="border-t pt-5">
        <div className="flex flex-wrap gap-2">
          {hasCoordinates && (
            <FieldBox
              label="Coordinates"
              value={`${event.location!.latitude!.toFixed(4)}, ${event.location!.longitude!.toFixed(4)}`}
              mono
            />
          )}

          {/* Geocoding Info */}
          {event.geocodingInfo && event.geocodingInfo.geocodingStatus !== "pending" && (
            <>
              {event.geocodingInfo.provider && (
                <FieldBox label="Geocoding" value={event.geocodingInfo.provider} capitalize />
              )}
              {event.geocodingInfo.confidence != null && (
                <FieldBox label="Confidence" value={`${(event.geocodingInfo.confidence * 100).toFixed(0)}%`} />
              )}
              <FieldBox
                label="Status"
                value={event.geocodingInfo.geocodingStatus ?? "unknown"}
                capitalize
                status={event.geocodingInfo.geocodingStatus as "success" | "failed" | "pending"}
              />
            </>
          )}

          {event.eventTimestamp && <FieldBox label="Event Date" value={formatDate(event.eventTimestamp)} />}

          {/* Additional Data Fields */}
          {additionalFields.map(([key, value]) => (
            <FieldBox key={key} label={key.replaceAll(/([A-Z])/g, " $1").trim()} value={safeToString(value)} />
          ))}
        </div>
      </div>

      {/* Metadata (page variant only) */}
      {variant === "page" && <EventMetadataCard event={event} />}
    </div>
  );
};

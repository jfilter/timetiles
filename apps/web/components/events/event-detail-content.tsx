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
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { getDatasetBadgeClass } from "@/lib/constants/dataset-colors";
import {
  buildConsumedFieldSet,
  extractEventFields,
  getDatasetInfo,
  getEventData,
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
  const locale = useLocale();
  const t = useTranslations("Events");
  const tCommon = useTranslations("Common");

  // Show loading state
  if (isLoading) {
    return <EventDetailSkeleton />;
  }

  // Show error state
  if (error) {
    return <EventDetailError error={error} onRetry={onRetry} />;
  }

  const eventData = getEventData(event);
  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;
  const { title, description: rawDescription } = extractEventFields(eventData, fieldMappings, event.id);
  const description = rawDescription ?? "";
  const eventDate = event.eventTimestamp ? new Date(event.eventTimestamp).toLocaleDateString(locale) : null;
  const locationDisplay = getLocationDisplay(event);
  const datasetInfo = getDatasetInfo(event.dataset);

  const hasCoordinates = hasValidCoordinates(event.location);
  const badgeClass = getDatasetBadgeClass(datasetInfo?.id ?? null);

  const consumedFields = buildConsumedFieldSet(fieldMappings);
  const additionalFields = Object.entries(eventData).filter(
    ([key, value]) => !consumedFields.has(key) && value != null && safeToString(value) !== ""
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
                <Link href={`/events/${event.id}`} target="_blank" aria-label={t("openInNewTab")}>
                  <ExternalLink className="h-5 w-5" />
                </Link>
              </Button>
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-muted"
                  onClick={onClose}
                  aria-label={tCommon("close")}
                >
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
      {(locationDisplay != null || eventDate != null) && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          {locationDisplay && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{locationDisplay}</span>
            </div>
          )}
          {eventDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{eventDate}</span>
            </div>
          )}
        </div>
      )}

      {/* All fields in flexible boxes */}
      <div className="border-t pt-5">
        <div className="flex flex-wrap gap-2">
          {hasCoordinates && (
            <FieldBox
              label={t("coordinates")}
              value={`${event.location!.latitude!.toFixed(4)}, ${event.location!.longitude!.toFixed(4)}`}
              mono
            />
          )}

          {/* Geocoding Info */}
          {event.geocodingInfo && event.geocodingInfo.geocodingStatus !== "pending" && (
            <>
              {event.geocodingInfo.provider && (
                <FieldBox label={t("geocoding")} value={event.geocodingInfo.provider} capitalize />
              )}
              {event.geocodingInfo.confidence != null && (
                <FieldBox label={t("confidence")} value={`${(event.geocodingInfo.confidence * 100).toFixed(0)}%`} />
              )}
              <FieldBox
                label={t("status")}
                value={event.geocodingInfo.geocodingStatus ?? t("statusUnknown")}
                capitalize
                status={event.geocodingInfo.geocodingStatus as "success" | "failed" | "pending"}
              />
            </>
          )}

          {/* Additional Data Fields */}
          {additionalFields.map(([key, value]) => (
            <FieldBox
              key={key}
              // eslint-disable-next-line i18next/no-literal-string -- regex replacement pattern, not user-facing text
              label={key.replaceAll(/([A-Z])/g, " $1").trim()}
              value={safeToString(value)}
            />
          ))}
        </div>
      </div>

      {/* Metadata (page variant only) */}
      {variant === "page" && <EventMetadataCard event={event} />}
    </div>
  );
};

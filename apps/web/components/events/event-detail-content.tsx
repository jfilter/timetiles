/**
 * Shared event detail content component.
 *
 * Displays comprehensive event information with dataset badge, title,
 * description, location/date row with icons, source data fields, and
 * a collapsible technical section for coordinates, geocoding, and metadata.
 *
 * @module
 * @category Components
 */
/* oxlint-disable complexity -- Event detail rendering has many conditional display sections */
"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@timetiles/ui";
import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Calendar, ChevronDown, ExternalLink, MapPin, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { getDatasetBadgeClass } from "@/lib/constants/dataset-colors";
import {
  buildConsumedFieldSet,
  extractEventFields,
  formatDateRange,
  getDatasetInfo,
  getEventData,
  getLocationDisplay,
  hasValidCoordinates,
} from "@/lib/utils/event-detail";
import { formatFieldLabel, valueToString } from "@/lib/utils/format";
import type { Event } from "@/payload-types";

import { EventDetailError } from "./event-detail-error";
import { EventDetailSkeleton } from "./event-detail-skeleton";
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

/** Keys that are internal/structural and should never appear as additional fields */
const HIDDEN_KEYS = new Set(["_feature_id", "id", "_id", "uid"]);

/** Keys that look like URLs/images and clutter the detail view */
const isMediaOrLinkKey = (key: string): boolean =>
  /^(link|url|href|image|thumbnail|teaserbild|pdf)$/i.test(key) || key.toLowerCase().endsWith("credit");

/** Map coordinate source type to a translation key */
const COORDINATE_SOURCE_KEYS = { "source-data": "coordinateSourceData", geocoded: "coordinateSourceGeocoded" } as const;

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

  if (isLoading) return <EventDetailSkeleton />;
  if (error) return <EventDetailError error={error} onRetry={onRetry} />;

  const eventData = getEventData(event);
  const fieldMappings =
    typeof event.dataset === "object" && event.dataset != null ? event.dataset.fieldMappingOverrides : null;
  const { title, description: rawDescription } = extractEventFields(eventData, fieldMappings, event.id);
  const description = rawDescription ?? "";
  const eventDate = formatDateRange(event.eventTimestamp, event.eventEndTimestamp, locale);
  const locationDisplay = getLocationDisplay(event);
  const datasetInfo = getDatasetInfo(event.dataset);
  const hasCoordinates = hasValidCoordinates(event.location);
  const badgeClass = getDatasetBadgeClass(datasetInfo?.id ?? null);

  // Read field type metadata from dataset (computed during schema detection)
  const fieldTypes =
    typeof event.dataset === "object" && event.dataset != null
      ? ((event.dataset as unknown as Record<string, unknown>).fieldTypes as Record<string, string[]> | null)
      : null;
  const tagFieldSet = new Set(fieldTypes?.tags ?? []);

  const consumedFields = buildConsumedFieldSet(fieldMappings);
  const allAdditionalFields = Object.entries(eventData).filter(
    ([key, value]) =>
      !consumedFields.has(key) &&
      !HIDDEN_KEYS.has(key) &&
      !isMediaOrLinkKey(key) &&
      value != null &&
      valueToString(value) !== ""
  );

  // Separate tag fields (identified by dataset.fieldTypes) from scalar fields
  const tagFields: Array<{ key: string; tags: string[] }> = [];
  const additionalFields: Array<[string, unknown]> = [];
  for (const [key, value] of allAdditionalFields) {
    if (tagFieldSet.has(key) && Array.isArray(value)) {
      const tags = value.filter((v): v is string | number => v != null && v !== "").map(String);
      if (tags.length > 0) tagFields.push({ key, tags });
    } else {
      additionalFields.push([key, value]);
    }
  }

  const coordinateSourceType = event.coordinateSource?.type;
  const hasGeocodingInfo =
    event.geocodingInfo?.geocodingStatus != null && event.geocodingInfo.geocodingStatus !== "pending";

  return (
    <div className={cn("space-y-5", variant === "page" && "mx-auto max-w-4xl")}>
      {/* Header with badge + action icons */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {datasetInfo && (
            <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", badgeClass)}>
              {datasetInfo.name}
            </span>
          )}
          <h2 className={cn("font-serif text-2xl leading-tight font-bold", datasetInfo && "mt-3")}>{title}</h2>
        </div>

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

      {/* Location and date row */}
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

      {/* Tag chips (categories, tags, etc.) */}
      {tagFields.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tagFields.flatMap(({ tags }) =>
            tags.map((tag) => (
              <span key={tag} className="bg-muted dark:bg-muted/60 inline-block rounded-sm px-2 py-0.5 text-xs">
                {tag}
              </span>
            ))
          )}
        </div>
      )}

      {/* Source data fields */}
      {additionalFields.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">{t("details")}</h4>
          <div className="flex flex-wrap gap-2">
            {additionalFields.map(([key, value]) => (
              <FieldBox key={key} label={formatFieldLabel(key)} value={valueToString(value)} />
            ))}
          </div>
        </div>
      )}

      {/* Technical info — collapsible */}
      {(hasCoordinates || hasGeocodingInfo || variant === "page") && (
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground flex w-full items-center gap-1.5 border-t pt-4 text-xs font-bold tracking-wider uppercase">
            {t("technicalInfo")}
            <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="flex flex-wrap gap-2 pt-3">
              {hasCoordinates && (
                <>
                  <FieldBox
                    label={t("coordinates")}
                    value={`${event.location!.latitude!.toFixed(4)}, ${event.location!.longitude!.toFixed(4)}`}
                    mono
                  />
                  <FieldBox
                    label={t("coordinateSource")}
                    value={t(
                      COORDINATE_SOURCE_KEYS[coordinateSourceType as keyof typeof COORDINATE_SOURCE_KEYS] ??
                        "coordinateSourceNone"
                    )}
                  />
                </>
              )}

              {hasGeocodingInfo && (
                <>
                  {event.geocodingInfo!.provider && (
                    <FieldBox label={t("geocoding")} value={event.geocodingInfo!.provider} capitalize />
                  )}
                  {event.geocodingInfo!.confidence != null && (
                    <FieldBox
                      label={t("confidence")}
                      value={`${(event.geocodingInfo!.confidence * 100).toFixed(0)}%`}
                    />
                  )}
                  <FieldBox
                    label={t("status")}
                    value={event.geocodingInfo!.geocodingStatus!}
                    capitalize
                    status={event.geocodingInfo!.geocodingStatus as "success" | "failed" | "pending"}
                  />
                </>
              )}

              {variant === "page" && (
                <>
                  <FieldBox
                    label={t("validation")}
                    value={event.validationStatus === "valid" ? t("valid") : t("invalid")}
                  />
                  {event.ingestBatch != null && <FieldBox label={t("importBatch")} value={String(event.ingestBatch)} />}
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Metadata card (page variant only) — kept for created/updated dates */}
      {variant === "page" && (
        <div className="border-t pt-4">
          <h4 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">{t("metadata")}</h4>
          <div className="flex flex-wrap gap-2">
            <FieldBox label={t("created")} value={formatDateRange(event.createdAt, null, locale) ?? ""} />
            <FieldBox label={t("updated")} value={formatDateRange(event.updatedAt, null, locale) ?? ""} />
          </div>
        </div>
      )}
    </div>
  );
};

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
/* eslint-disable complexity -- Event detail rendering has many conditional display sections */
"use client";

import { Button, Card, CardContent, ContentState } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertTriangle, Calendar, Check, Copy, ExternalLink, Loader2, MapPin, Share2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { formatDate } from "@/lib/utils/date";
import type { Event } from "@/payload-types";

export interface EventDetailContentProps {
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

// Type for event data object
interface EventData {
  title?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  city?: string;
  country?: string;
  [key: string]: unknown;
}

const safeToString = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  return "";
};

const getEventData = (event: Event): EventData => {
  return typeof event.data === "object" && event.data != null && !Array.isArray(event.data)
    ? (event.data as EventData)
    : {};
};

const getEventTitle = (eventData: EventData): string => {
  return safeToString(eventData.title) || safeToString(eventData.name) || "Untitled Event";
};

const getDatasetInfo = (dataset: unknown): { name: string; id: number } | null => {
  if (typeof dataset === "object" && dataset != null && "id" in dataset) {
    const d = dataset as Record<string, unknown>;
    // API returns 'title', Payload returns 'name'
    let name: string | null = null;
    if (typeof d.title === "string") {
      name = d.title;
    } else if (typeof d.name === "string") {
      name = d.name;
    }
    if (name) {
      return { name, id: Number(d.id) };
    }
  }
  return null;
};

const formatDateRange = (startDate: unknown, endDate: unknown): string | null => {
  const hasStart = startDate != null && safeToString(startDate) !== "";
  const hasEnd = endDate != null && safeToString(endDate) !== "";

  if (!hasStart && !hasEnd) return null;

  const parts: string[] = [];
  if (hasStart) {
    parts.push(new Date(safeToString(startDate)).toLocaleDateString("en-US"));
  }
  if (hasEnd && safeToString(startDate) !== safeToString(endDate)) {
    parts.push(new Date(safeToString(endDate)).toLocaleDateString("en-US"));
  }

  return parts.join(" - ");
};

const getLocationDisplay = (event: Event, eventData: EventData): string | null => {
  // Prefer location name (venue, place name) if available
  if (event.locationName) {
    return event.locationName;
  }
  // Fall back to geocoded/normalized address
  if (event.geocodingInfo?.normalizedAddress) {
    return event.geocodingInfo.normalizedAddress;
  }
  // Final fallback to city/country from data
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

const hasValidCoordinates = (location: Event["location"]): boolean => {
  return (
    location?.latitude != null && location.latitude !== 0 && location?.longitude != null && location.longitude !== 0
  );
};

// Dataset badge colors - assigned by ID so first datasets get best colors
const DATASET_BADGE_COLORS = [
  "bg-cartographic-blue/10 text-cartographic-blue",
  "bg-cartographic-terracotta/10 text-cartographic-terracotta",
  "bg-cartographic-forest/10 text-cartographic-forest",
  "bg-cartographic-teal/10 text-cartographic-teal",
  "bg-cartographic-amber/10 text-cartographic-amber",
  "bg-cartographic-plum/10 text-cartographic-plum",
  "bg-cartographic-rose/10 text-cartographic-rose",
  "bg-cartographic-olive/10 text-cartographic-olive",
  "bg-cartographic-navy/10 text-cartographic-navy",
  "bg-cartographic-slate/10 text-cartographic-slate",
] as const;

const getDatasetBadgeClass = (datasetId: number | null): string => {
  // Use ID directly - dataset 1 gets color 0, dataset 2 gets color 1, etc.
  const index = datasetId === null ? 0 : (datasetId - 1) % DATASET_BADGE_COLORS.length;
  // Index is always valid since we use modulo with array length
  return DATASET_BADGE_COLORS[index] ?? DATASET_BADGE_COLORS[0];
};

// Loading skeleton component
export const EventDetailSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="space-y-3">
      <div className="bg-muted h-5 w-24 rounded-sm" />
      <div className="bg-muted h-8 w-3/4 rounded" />
    </div>
    <div className="space-y-2">
      <div className="bg-muted h-4 w-full rounded" />
      <div className="bg-muted h-4 w-5/6 rounded" />
    </div>
    <div className="bg-muted h-5 w-full rounded" />
    <div className="flex flex-wrap gap-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-muted h-14 min-w-[140px] flex-1 rounded-sm" />
      ))}
    </div>
  </div>
);

// Error state component
export const EventDetailError = ({ error, onRetry }: { error: Error | null; onRetry?: () => void }) => {
  const isNotFound = error?.message?.includes("not found");
  return (
    <ContentState
      variant="error"
      icon={
        <div className="bg-destructive/10 rounded-full p-4">
          <AlertTriangle className="text-destructive h-8 w-8" />
        </div>
      }
      title={isNotFound ? "Event Not Found" : "Failed to Load Event"}
      subtitle={
        isNotFound
          ? "This event may have been deleted or you don't have permission to view it."
          : "There was a problem loading the event details. Please try again."
      }
      onRetry={isNotFound ? undefined : onRetry}
      className="py-12"
    />
  );
};

// Share button with internal state management
const ShareButton = ({ title }: { title: string }) => {
  const [shareState, setShareState] = useState<"idle" | "copying" | "copied" | "error">("idle");

  const handleShare = useCallback(() => {
    const performShare = async () => {
      setShareState("copying");
      try {
        const url = window.location.href;

        if (navigator.share && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
          await navigator.share({ title, url });
          setShareState("idle");
          return;
        }

        await navigator.clipboard.writeText(url);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setShareState("error");
          setTimeout(() => setShareState("idle"), 2000);
        } else {
          setShareState("idle");
        }
      }
    };

    void performShare();
  }, [title]);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="hover:bg-muted"
      onClick={handleShare}
      disabled={shareState === "copying"}
      aria-label={shareState === "copied" ? "Link copied" : "Share event"}
    >
      {shareState === "copying" && <Loader2 className="h-5 w-5 animate-spin" />}
      {shareState === "copied" && <Check className="text-cartographic-forest h-5 w-5" />}
      {shareState === "error" && <Copy className="text-destructive h-5 w-5" />}
      {shareState === "idle" && <Share2 className="h-5 w-5" />}
    </Button>
  );
};

// Field box component for flexible attribute display
interface FieldBoxProps {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  status?: "success" | "failed" | "pending";
}

// Calculate flex-grow based on value length for responsive sizing
const getFlexGrow = (value: string): string => {
  const len = value.length;
  if (len <= 10) return "flex-[1_1_140px]"; // Short: coordinates, status
  if (len <= 25) return "flex-[2_1_180px]"; // Medium: dates, providers
  return "flex-[3_1_240px]"; // Long: addresses, descriptions
};

const FieldBox = ({ label, value, mono, capitalize, status }: FieldBoxProps) => (
  <div className={cn("bg-muted/40 dark:bg-muted/20 rounded-sm px-3 py-2", getFlexGrow(value))}>
    <p className="text-muted-foreground mb-0.5 text-xs">{label}</p>
    <p
      className={cn(
        "text-sm",
        mono && "font-mono",
        capitalize && "capitalize",
        status === "success" && "text-cartographic-forest",
        status === "failed" && "text-destructive"
      )}
    >
      {value}
    </p>
  </div>
);

// Event metadata card (page variant only)
const EventMetadataCard = ({ event }: { event: Event }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-muted-foreground mb-3 text-xs font-bold tracking-wider uppercase">Metadata</h4>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Created</p>
          <p>{formatDate(event.createdAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Updated</p>
          <p>{formatDate(event.updatedAt)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Validation</p>
          <p
            className={cn(
              event.validationStatus === "valid" && "text-cartographic-forest",
              event.validationStatus !== "valid" && "text-destructive"
            )}
          >
            {event.validationStatus === "valid" ? "Valid" : "Invalid"}
          </p>
        </div>
        {event.importBatch != null && (
          <div>
            <p className="text-muted-foreground">Import Batch</p>
            <p>{event.importBatch}</p>
          </div>
        )}
      </div>
    </CardContent>
  </Card>
);

export const EventDetailContent = ({
  event,
  variant = "modal",
  onClose,
  isLoading,
  error,
  onRetry,
}: EventDetailContentProps) => {
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

  // Get additional data fields (excluding known fields)
  const knownFields = ["title", "name", "description", "startDate", "endDate", "city", "country", "id"];
  const additionalFields = Object.entries(eventData).filter(
    ([key, value]) => !knownFields.includes(key) && value != null && safeToString(value) !== ""
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
            <FieldBox key={key} label={key.replace(/([A-Z])/g, " $1").trim()} value={safeToString(value)} />
          ))}
        </div>
      </div>

      {/* Metadata (page variant only) */}
      {variant === "page" && <EventMetadataCard event={event} />}
    </div>
  );
};

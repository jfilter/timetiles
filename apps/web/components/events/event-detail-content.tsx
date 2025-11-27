/**
 * Shared event detail content component.
 *
 * Displays comprehensive event information including header, location,
 * and data fields. Used by both the event detail modal and the full
 * event detail page for consistent rendering.
 *
 * @module
 * @category Components
 */
"use client";

import { Button, Card, CardContent, CardSpec, CardSpecItem } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, MapPin, RefreshCw, Share2, X } from "lucide-react";
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
  if (typeof dataset === "object" && dataset != null && "name" in dataset && "id" in dataset) {
    return { name: String(dataset.name), id: Number(dataset.id) };
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
  if (event.geocodingInfo?.normalizedAddress) {
    return event.geocodingInfo.normalizedAddress;
  }
  const cityCountry = [safeToString(eventData.city), safeToString(eventData.country)].filter(Boolean);
  return cityCountry.length > 0 ? cityCountry.join(", ") : null;
};

const hasValidCoordinates = (location: Event["location"]): boolean => {
  return (
    location?.latitude != null && location.latitude !== 0 && location?.longitude != null && location.longitude !== 0
  );
};

// Loading skeleton component
export const EventDetailSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="bg-muted h-8 w-3/4 rounded" />
    <div className="space-y-2">
      <div className="bg-muted h-4 w-full rounded" />
      <div className="bg-muted h-4 w-5/6 rounded" />
      <div className="bg-muted h-4 w-4/6 rounded" />
    </div>
    <div className="grid grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-muted h-20 rounded-sm" />
      ))}
    </div>
  </div>
);

// Error state component
export const EventDetailError = ({ error, onRetry }: { error: Error | null; onRetry?: () => void }) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="bg-destructive/10 mb-4 rounded-full p-4">
      <AlertTriangle className="text-destructive h-8 w-8" />
    </div>
    <h3 className="mb-2 font-serif text-xl font-bold">
      {error?.message?.includes("not found") ? "Event Not Found" : "Failed to Load Event"}
    </h3>
    <p className="text-muted-foreground mb-6 max-w-sm">
      {error?.message?.includes("not found")
        ? "This event may have been deleted or you don't have permission to view it."
        : "There was a problem loading the event details. Please try again."}
    </p>
    {onRetry && !error?.message?.includes("not found") && (
      <Button variant="outline" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Try Again
      </Button>
    )}
  </div>
);

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

// Geocoding info display
const GeocodingInfoCard = ({ geocodingInfo }: { geocodingInfo: NonNullable<Event["geocodingInfo"]> }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-muted-foreground mb-2 text-xs font-bold uppercase tracking-wider">Geocoding</h4>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {geocodingInfo.provider && (
          <div>
            <span className="text-muted-foreground">Provider:</span>{" "}
            <span className="capitalize">{geocodingInfo.provider}</span>
          </div>
        )}
        {geocodingInfo.confidence != null && (
          <div>
            <span className="text-muted-foreground">Confidence:</span> {(geocodingInfo.confidence * 100).toFixed(0)}%
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Status:</span>{" "}
          <span
            className={cn(
              "capitalize",
              geocodingInfo.geocodingStatus === "success" && "text-cartographic-forest",
              geocodingInfo.geocodingStatus === "failed" && "text-destructive"
            )}
          >
            {geocodingInfo.geocodingStatus}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Additional data fields display
const AdditionalFieldsSection = ({ fields }: { fields: [string, unknown][] }) => (
  <div className="space-y-3">
    <h4 className="text-muted-foreground text-xs font-bold uppercase tracking-wider">Additional Details</h4>
    <div className="grid gap-3">
      {fields.map(([key, value]) => (
        <div key={key} className="border-cartographic-navy/20 border-l-2 pl-3">
          <p className="text-muted-foreground text-xs font-medium capitalize">
            {key.replace(/([A-Z])/g, " $1").trim()}
          </p>
          <p className="text-sm">{safeToString(value)}</p>
        </div>
      ))}
    </div>
  </div>
);

// Event metadata card (page variant only)
const EventMetadataCard = ({ event }: { event: Event }) => (
  <Card variant="ghost" padding="sm">
    <CardContent className="p-4">
      <h4 className="text-muted-foreground mb-3 text-xs font-bold uppercase tracking-wider">Metadata</h4>
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

  // Get additional data fields (excluding known fields)
  const knownFields = ["title", "name", "description", "startDate", "endDate", "city", "country", "id"];
  const additionalFields = Object.entries(eventData).filter(
    ([key, value]) => !knownFields.includes(key) && value != null && safeToString(value) !== ""
  );

  return (
    <div className={cn("space-y-6", variant === "page" && "mx-auto max-w-4xl")}>
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground mb-1 font-mono text-xs uppercase tracking-wider">Event #{event.id}</p>
            <h2 className="font-serif text-2xl font-bold leading-tight">{title}</h2>
          </div>

          {/* Actions - all icons in one row */}
          <div className="flex flex-shrink-0 items-center gap-1">
            <ShareButton title={title} />
            {variant === "modal" && (
              <>
                <Button variant="ghost" size="icon" asChild>
                  <Link href={`/events/${event.id}`} target="_blank" aria-label="Open in new tab">
                    <ExternalLink className="h-5 w-5" />
                  </Link>
                </Button>
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {description && <p className="text-muted-foreground leading-relaxed">{description}</p>}
      </div>

      {/* Quick Info */}
      <CardSpec>
        {dateRange && <CardSpecItem label="Date">{dateRange}</CardSpecItem>}

        {locationDisplay && (
          <CardSpecItem label="Location">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              {locationDisplay}
            </span>
          </CardSpecItem>
        )}

        {hasCoordinates && (
          <CardSpecItem label="Coordinates">
            <span className="font-mono text-xs">
              {event.location!.latitude!.toFixed(4)}, {event.location!.longitude!.toFixed(4)}
            </span>
          </CardSpecItem>
        )}

        {datasetInfo && <CardSpecItem label="Dataset">{datasetInfo.name}</CardSpecItem>}

        {event.eventTimestamp && <CardSpecItem label="Event Date">{formatDate(event.eventTimestamp)}</CardSpecItem>}
      </CardSpec>

      {/* Geocoding Info */}
      {event.geocodingInfo && event.geocodingInfo.geocodingStatus !== "pending" && (
        <GeocodingInfoCard geocodingInfo={event.geocodingInfo} />
      )}

      {/* Additional Data Fields */}
      {additionalFields.length > 0 && <AdditionalFieldsSection fields={additionalFields} />}

      {/* Metadata (page variant only) */}
      {variant === "page" && <EventMetadataCard event={event} />}
    </div>
  );
};

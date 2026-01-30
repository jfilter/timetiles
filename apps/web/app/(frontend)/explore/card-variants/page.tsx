/**
 * Demo page for comparing event card design variants.
 *
 * User selected: Variant C (Rich with Badges) with header icons from current modal.
 * Now showing 5 CREATIVE variants for attribute display in the modal.
 *
 * @module
 */
/* eslint-disable */
// @ts-nocheck
"use client";

import { Button, Card, CardDescription, CardTitle, Dialog, DialogContent } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { Calendar, ExternalLink, MapPin, Share2, X } from "lucide-react";
import { useCallback, useState } from "react";

// Mock data for testing different card states
const mockEvents = [
  {
    id: 1,
    title: "The Great Exhibition of 1851",
    description:
      "A grand international exhibition showcasing industrial achievements from around the world, held in the Crystal Palace in Hyde Park. The exhibition was organized by Prince Albert and Henry Cole, and became a symbol of industrial revolution achievements.",
    date: "May 1, 1851 - Oct 15, 1851",
    shortDate: "May 1851",
    location: "London, United Kingdom",
    coordinates: { lat: 51.5014, lng: -0.1419 },
    dataset: "Historical Exhibitions",
    datasetColor: "blue" as const,
    geocoding: { provider: "google", confidence: 0.95, status: "success" },
    additionalFields: {
      organizer: "Prince Albert",
      visitors: "6 million",
      exhibitors: "14,000",
    },
  },
  {
    id: 2,
    title: "Apollo 11 Moon Landing",
    description:
      "First humans walk on the Moon. Neil Armstrong and Buzz Aldrin became the first humans to set foot on the lunar surface while Michael Collins orbited above.",
    date: "July 20, 1969",
    shortDate: "Jul 1969",
    location: "Sea of Tranquility, Moon",
    coordinates: { lat: 0.6744, lng: 23.4731 },
    dataset: "Space Exploration",
    datasetColor: "terracotta" as const,
    geocoding: { provider: "manual", confidence: 1.0, status: "success" },
    additionalFields: {
      crew: "Armstrong, Aldrin, Collins",
      duration: "8 days, 3 hours",
      spacecraft: "Saturn V / Columbia / Eagle",
    },
  },
  {
    id: 3,
    title: "Local Farmers Market",
    description: null,
    date: "Every Saturday",
    shortDate: "Weekly",
    location: "Portland, OR",
    coordinates: { lat: 45.5152, lng: -122.6784 },
    dataset: "Community Events",
    datasetColor: "forest" as const,
    geocoding: { provider: "google", confidence: 0.88, status: "success" },
    additionalFields: {},
  },
  {
    id: 4,
    title: "Renaissance Art Exhibition: Masters of Florence",
    description:
      "An extraordinary collection featuring works by Botticelli, Leonardo da Vinci, and Michelangelo. Experience the brilliance of the Italian Renaissance through over 200 carefully curated masterpieces.",
    date: "March 15, 2024 - September 30, 2024",
    shortDate: "Mar-Sep 2024",
    location: "Metropolitan Museum of Art, New York City",
    coordinates: { lat: 40.7794, lng: -73.9632 },
    dataset: "Art & Culture",
    datasetColor: "navy" as const,
    geocoding: { provider: "google", confidence: 0.98, status: "success" },
    additionalFields: {
      curator: "Dr. Maria Rosetti",
      artworks: "200+",
      ticketPrice: "$25",
    },
  },
];

type MockEvent = (typeof mockEvents)[0];
type DatasetColor = "blue" | "terracotta" | "forest" | "navy";

const colorClasses: Record<DatasetColor, { badge: string }> = {
  blue: { badge: "bg-cartographic-blue/10 text-cartographic-blue" },
  terracotta: { badge: "bg-cartographic-terracotta/10 text-cartographic-terracotta" },
  forest: { badge: "bg-cartographic-forest/10 text-cartographic-forest" },
  navy: { badge: "bg-cartographic-navy/10 text-cartographic-navy" },
};

// =============================================================================
// VARIANT 1: FLEXIBLE BOXES
// Each field in its own box, flex-wrap for responsive columns
// =============================================================================
const AttributesVariant1 = ({ event }: { event: MockEvent }) => {
  const additionalFieldEntries = Object.entries(event.additionalFields);

  const allFields = [
    {
      label: "Coordinates",
      value: `${event.coordinates.lat.toFixed(4)}, ${event.coordinates.lng.toFixed(4)}`,
      mono: true,
    },
    { label: "Geocoding", value: event.geocoding.provider, capitalize: true },
    { label: "Confidence", value: `${(event.geocoding.confidence * 100).toFixed(0)}%` },
    ...additionalFieldEntries.map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").trim(),
      value: String(value),
    })),
  ];

  return (
    <div className="mt-5 border-t pt-5">
      <div className="flex flex-wrap gap-2">
        {allFields.map((field) => (
          <div key={field.label} className="bg-muted/40 min-w-[140px] flex-1 rounded-sm px-3 py-2">
            <p className="text-muted-foreground mb-0.5 text-xs">{field.label}</p>
            <p className={cn("text-sm", field.mono && "font-mono", field.capitalize && "capitalize")}>{field.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// VARIANT 2: TWO COLUMN LIST
// Simple vertical list with label: value pairs
// =============================================================================
const AttributesVariant2 = ({ event }: { event: MockEvent }) => {
  const additionalFieldEntries = Object.entries(event.additionalFields);

  const allFields = [
    {
      label: "Coordinates",
      value: `${event.coordinates.lat.toFixed(4)}, ${event.coordinates.lng.toFixed(4)}`,
      mono: true,
    },
    { label: "Geocoding", value: event.geocoding.provider },
    { label: "Confidence", value: `${(event.geocoding.confidence * 100).toFixed(0)}%` },
    ...additionalFieldEntries.map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").trim(),
      value: String(value),
    })),
  ];

  return (
    <div className="mt-5 border-t pt-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {allFields.map((field) => (
          <div key={field.label} className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground text-sm">{field.label}</span>
            <span className={cn("text-right text-sm", field.mono && "font-mono")}>{field.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// VARIANT 3: GROUPED SECTIONS
// Geo data and custom fields in separate light boxes
// =============================================================================
const AttributesVariant3 = ({ event }: { event: MockEvent }) => {
  const additionalFieldEntries = Object.entries(event.additionalFields);

  return (
    <div className="mt-5 space-y-3">
      {/* Geocoding section */}
      <div className="bg-muted/40 rounded-sm p-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-muted-foreground mb-1 text-xs">Coordinates</p>
            <p className="font-mono text-sm">
              {event.coordinates.lat.toFixed(4)}, {event.coordinates.lng.toFixed(4)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs">Provider</p>
            <p className="text-sm capitalize">{event.geocoding.provider}</p>
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs">Confidence</p>
            <p className="text-sm">{(event.geocoding.confidence * 100).toFixed(0)}%</p>
          </div>
        </div>
      </div>

      {/* Additional fields section */}
      {additionalFieldEntries.length > 0 && (
        <div className="bg-muted/40 rounded-sm p-4">
          <div className="grid grid-cols-3 gap-4">
            {additionalFieldEntries.map(([key, value]) => (
              <div key={key}>
                <p className="text-muted-foreground mb-1 text-xs">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                <p className="text-sm">{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// VARIANT 4: INLINE COMPACT
// Horizontal flow with subtle separators
// =============================================================================
const AttributesVariant4 = ({ event }: { event: MockEvent }) => {
  const additionalFieldEntries = Object.entries(event.additionalFields);

  const allItems = [
    { label: "Coords", value: `${event.coordinates.lat.toFixed(4)}, ${event.coordinates.lng.toFixed(4)}`, mono: true },
    { label: "Via", value: event.geocoding.provider },
    { label: "Confidence", value: `${(event.geocoding.confidence * 100).toFixed(0)}%` },
    ...additionalFieldEntries.map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, " $1").trim(),
      value: String(value),
    })),
  ];

  return (
    <div className="mt-5 border-t pt-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {allItems.map((item, i) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">{item.label}:</span>
            <span className={item.mono ? "font-mono" : ""}>{item.value}</span>
            {i < allItems.length - 1 && <span className="text-muted-foreground/30 ml-2">•</span>}
          </span>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// VARIANT 5: DEFINITION LIST
// Classic dl/dt/dd style, clean and readable
// =============================================================================
const AttributesVariant5 = ({ event }: { event: MockEvent }) => {
  const additionalFieldEntries = Object.entries(event.additionalFields);

  return (
    <div className="mt-5 border-t pt-5">
      <dl className="space-y-3">
        <div className="flex gap-4">
          <dt className="text-muted-foreground w-24 shrink-0 text-sm">Coordinates</dt>
          <dd className="font-mono text-sm">
            {event.coordinates.lat.toFixed(4)}, {event.coordinates.lng.toFixed(4)}
          </dd>
        </div>
        <div className="flex gap-4">
          <dt className="text-muted-foreground w-24 shrink-0 text-sm">Geocoding</dt>
          <dd className="text-sm capitalize">{event.geocoding.provider}</dd>
        </div>
        <div className="flex gap-4">
          <dt className="text-muted-foreground w-24 shrink-0 text-sm">Confidence</dt>
          <dd className="text-sm">{(event.geocoding.confidence * 100).toFixed(0)}%</dd>
        </div>
        {additionalFieldEntries.map(([key, value]) => (
          <div key={key} className="flex gap-4">
            <dt className="text-muted-foreground w-24 shrink-0 text-sm">{key.replace(/([A-Z])/g, " $1").trim()}</dt>
            <dd className="text-sm">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

type AttributeVariant = 1 | 2 | 3 | 4 | 5;

// =============================================================================
// MODAL - Shows selected attribute variant
// =============================================================================
const EventDetailModal = ({
  event,
  open,
  onClose,
  attributeVariant,
}: {
  event: MockEvent | null;
  open: boolean;
  onClose: () => void;
  attributeVariant: AttributeVariant;
}) => {
  if (!event) return null;

  const colors = colorClasses[event.datasetColor];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        variant="wide"
        showCloseButton={false}
        className="border-border bg-background max-h-[90vh] max-w-3xl overflow-y-auto border-2 p-6"
      >
        {/* Header with badge + action icons (from current modal) */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", colors.badge)}>
              {event.dataset}
            </span>
            <h2 className="mt-3 font-serif text-2xl leading-tight font-bold">{event.title}</h2>
          </div>

          {/* Action icons - kept from current modal */}
          <div className="relative z-10 flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="hover:bg-muted" aria-label="Share">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:bg-muted" aria-label="Open in new tab">
              <ExternalLink className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:bg-muted" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {event.description && <p className="text-muted-foreground mt-4 leading-relaxed">{event.description}</p>}

        {/* Location and date - one row */}
        <div className="text-muted-foreground mt-5 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{event.location}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{event.date}</span>
          </div>
        </div>

        {/* Attribute display - switchable variants */}
        {attributeVariant === 1 && <AttributesVariant1 event={event} />}
        {attributeVariant === 2 && <AttributesVariant2 event={event} />}
        {attributeVariant === 3 && <AttributesVariant3 event={event} />}
        {attributeVariant === 4 && <AttributesVariant4 event={event} />}
        {attributeVariant === 5 && <AttributesVariant5 event={event} />}
      </DialogContent>
    </Dialog>
  );
};

// =============================================================================
// CARD - Variant C: Rich with Badges
// =============================================================================
const EventCard = ({ event, onClick }: { event: MockEvent; onClick: () => void }) => {
  const colors = colorClasses[event.datasetColor];

  return (
    <Card
      className={cn(
        "border-border bg-background cursor-pointer border-2 p-5",
        "hover:border-cartographic-blue transition-colors duration-200",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      )}
      tabIndex={0}
      role="button"
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
    >
      <span className={cn("inline-block rounded-sm px-2 py-0.5 text-xs font-medium", colors.badge)}>
        {event.dataset}
      </span>

      <CardTitle className="mt-3 text-xl">{event.title}</CardTitle>

      {event.description && <CardDescription className="mt-2 line-clamp-2">{event.description}</CardDescription>}

      <div className="text-muted-foreground mt-4 flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{event.date}</span>
        </div>
      </div>
    </Card>
  );
};

// =============================================================================
// Main Page
// =============================================================================
export default function CardVariantsPage() {
  const [selectedEvent, setSelectedEvent] = useState<MockEvent | null>(null);
  const [attributeVariant, setAttributeVariant] = useState<AttributeVariant>(1);

  const handleCardClick = useCallback((event: MockEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const variantDescriptions: Record<AttributeVariant, { name: string; desc: string }> = {
    1: { name: "Flexible Boxes", desc: "Each field in a box, adapts to width" },
    2: { name: "Two Column", desc: "Label and value side by side" },
    3: { name: "Grouped", desc: "Separate boxes for geo and custom data" },
    4: { name: "Inline", desc: "Horizontal flow with dot separators" },
    5: { name: "Definition List", desc: "Classic label-value vertical list" },
  };

  return (
    <div className="bg-cartographic-parchment min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-cartographic-charcoal font-serif text-3xl font-bold">Attribute Display Variants</h1>
          <p className="text-cartographic-navy/70 mt-2">
            5 creative approaches to displaying event metadata. Click any card to preview.
          </p>
        </div>

        {/* Attribute Variant Selector */}
        <div className="border-cartographic-navy/20 bg-background mb-6 rounded-sm border-2 p-4">
          <p className="text-cartographic-charcoal mb-3 text-sm font-semibold">Choose a style:</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {([1, 2, 3, 4, 5] as const).map((v) => (
              <button
                key={v}
                onClick={() => setAttributeVariant(v)}
                className={cn(
                  "rounded-md border-2 px-3 py-2 text-left transition-colors",
                  attributeVariant === v
                    ? "border-cartographic-blue bg-cartographic-blue/10"
                    : "border-border hover:border-cartographic-navy/40"
                )}
              >
                <span className="block text-sm font-medium">
                  {v}. {variantDescriptions[v].name}
                </span>
                <span className="text-muted-foreground mt-0.5 block text-xs">{variantDescriptions[v].desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {mockEvents.map((event) => (
            <EventCard key={event.id} event={event} onClick={() => handleCardClick(event)} />
          ))}
        </div>
      </div>

      <EventDetailModal
        event={selectedEvent}
        open={selectedEvent !== null}
        onClose={handleCloseModal}
        attributeVariant={attributeVariant}
      />
    </div>
  );
}

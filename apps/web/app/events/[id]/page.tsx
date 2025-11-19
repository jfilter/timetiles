/**
 * This file defines the page for displaying the details of a single event.
 *
 * It fetches the data for a specific event from the Payload CMS based on the ID from
 * the URL. It supports Next.js's Draft Mode, allowing authenticated users to preview
 * draft versions of events. The page displays the event intelligently based on
 * dataset field metadata, along with location and the raw JSON data.
 * @module
 */
import configPromise from "@payload-config";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { getPayload } from "payload";

import { formatDate } from "@/lib/utils/date";
import { formatEventForDisplay } from "@/lib/utils/event-display-formatter";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { id } = await params;

  return {
    title: `Event: ${id}`,
  };
};

interface EventDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

// Helper component for draft mode banner
const DraftModeBanner = () => (
  <div className="mb-6 rounded border border-yellow-400 bg-yellow-100 px-4 py-3 text-yellow-700">
    <p className="font-bold">Preview Mode</p>
    <p className="text-sm">You are viewing a draft version of this event.</p>
  </div>
);

export default async function EventDetailsPage({ params }: Readonly<EventDetailsPageProps>) {
  const { id } = await params;
  const { isEnabled: isDraftMode } = await draftMode();

  const payload = await getPayload({ config: configPromise });

  // Fetch the event with draft mode support
  const result = await payload.find({
    collection: "events",
    where: {
      id: {
        equals: id,
      },
    },
    depth: 2, // Include related data like dataset
    draft: isDraftMode,
    overrideAccess: isDraftMode, // Allow access to drafts in preview mode
    limit: 1,
  });

  const event = result.docs[0];

  if (!event) {
    notFound();
  }

  // Extract event data
  const eventData = event.data as Record<string, unknown>;
  const dataset = typeof event.dataset === "object" ? event.dataset : null;
  const fieldMetadata = dataset && typeof dataset.fieldMetadata === "object" ? dataset.fieldMetadata : null;
  const displayConfig = dataset && typeof dataset.displayConfig === "object" ? dataset.displayConfig : null;

  const displayInfo = formatEventForDisplay(
    eventData,
    fieldMetadata as Record<string, unknown> | null,
    event.id,
    displayConfig as never
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      {/* Draft Mode Banner */}
      {isDraftMode && <DraftModeBanner />}

      {/* Event Header */}
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">{displayInfo.primaryLabel}</h1>

        <div className="flex flex-wrap gap-4 text-sm text-gray-600">
          {event.eventTimestamp != null && <span>Event Date: {formatDate(event.eventTimestamp)}</span>}
          {dataset != null && <span>Dataset: {dataset.name}</span>}
          <span>Status: {event._status ?? "published"}</span>
        </div>
      </header>

      {/* Location Information */}
      {event.location != null && (event.location.latitude != null || event.location.longitude != null) && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Location</h2>
          <div className="rounded bg-gray-50 p-4">
            <p>Latitude: {event.location.latitude}</p>
            <p>Longitude: {event.location.longitude}</p>
            {event.coordinateSource?.confidence != null && (
              <p className="mt-2 text-sm text-gray-600">
                Confidence: {(event.coordinateSource.confidence * 100).toFixed(0)}%
              </p>
            )}
          </div>
        </section>
      )}

      {/* Event Data */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Event Details</h2>
        <div className="rounded bg-gray-50 p-4">
          <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(eventData, null, 2)}</pre>
        </div>
      </section>

      {/* Metadata */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Metadata</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold">Created:</p>
            <p>{formatDate(event.createdAt)}</p>
          </div>
          <div>
            <p className="font-semibold">Updated:</p>
            <p>{formatDate(event.updatedAt)}</p>
          </div>
          <div>
            <p className="font-semibold">Validation Status:</p>
            <p className={event.validationStatus === "valid" ? "text-green-600" : "text-red-600"}>
              {event.validationStatus === "valid" ? "Valid" : "Invalid"}
            </p>
          </div>
          <div>
            <p className="font-semibold">Import Batch:</p>
            <p>{event.importBatch ?? "N/A"}</p>
          </div>
        </div>
      </section>

      {/* Validation Errors */}
      {event.validationErrors != null && Array.isArray(event.validationErrors) && event.validationErrors.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl font-semibold">Validation Errors</h2>
          <div className="rounded bg-red-50 p-4">
            <pre className="whitespace-pre-wrap text-sm text-red-700">
              {JSON.stringify(event.validationErrors, null, 2)}
            </pre>
          </div>
        </section>
      )}

      {/* Schema Version Info */}
      {event.schemaVersionNumber != null && (
        <section className="text-sm text-gray-500">
          <p>Schema Version: {event.schemaVersionNumber}</p>
        </section>
      )}
    </div>
  );
}

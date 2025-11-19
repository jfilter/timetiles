/**
 * This file defines the page for listing events.
 *
 * It fetches a list of the 50 most recent, published events from the Payload CMS.
 * Each event in the list is displayed intelligently based on dataset field metadata,
 * and serves as a link to the detailed event page.
 *
 * @module
 */
import configPromise from "@payload-config";
import Link from "next/link";
import { getPayload } from "payload";

import { formatDateShort } from "@/lib/utils/date";
import { formatEventForDisplay } from "@/lib/utils/event-display-formatter";

export const dynamic = "force-dynamic";

export default async function EventsListPage() {
  const payload = await getPayload({ config: configPromise });

  // Fetch published events
  const { docs: events } = await payload.find({
    collection: "events",
    limit: 50,
    sort: "-eventTimestamp",
    where: {
      _status: {
        equals: "published",
      },
    },
    depth: 1, // Include dataset info
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Events</h1>

      {events.length === 0 ? (
        <p className="text-gray-500">No events found.</p>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const dataset = typeof event.dataset === "object" ? event.dataset : null;
            const eventData = typeof event.data === "object" && event.data != null ? event.data : {};
            const fieldMetadata =
              dataset && typeof dataset.fieldMetadata === "object" ? dataset.fieldMetadata : null;
            const displayConfig =
              dataset && typeof dataset.displayConfig === "object" ? dataset.displayConfig : null;

            const displayInfo = formatEventForDisplay(
              eventData as Record<string, unknown>,
              fieldMetadata as Record<string, unknown> | null,
              event.id,
              displayConfig as never
            );

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block rounded-lg border p-4 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="mb-1 text-xl font-semibold">{displayInfo.primaryLabel}</h2>
                    <div className="space-y-1 text-sm text-gray-600">
                      {event.eventTimestamp != null && <p>Date: {formatDateShort(event.eventTimestamp)}</p>}
                      {dataset != null && <p>Dataset: {dataset.name}</p>}
                      {event.location != null &&
                        (event.location.latitude != null || event.location.longitude != null) && (
                          <p>
                            Location: {event.location.latitude?.toFixed(4)}, {event.location.longitude?.toFixed(4)}
                          </p>
                        )}
                    </div>
                  </div>
                  <div className="text-sm">
                    {event.validationStatus === "valid" ? (
                      <span className="text-green-600">✓ Valid</span>
                    ) : (
                      <span className="text-red-600">✗ Invalid</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-sm text-gray-500">
        <p>Showing up to 50 most recent events</p>
      </div>
    </div>
  );
}

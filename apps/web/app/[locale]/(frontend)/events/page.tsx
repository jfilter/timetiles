/**
 * This file defines the page for listing events.
 *
 * It fetches a list of the 50 most recent, published events from the Payload CMS.
 * Each event in the list is displayed with its title, date, dataset, and location,
 * and serves as a link to the detailed event page.
 *
 * @module
 */
import configPromise from "@payload-config";
import { getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { Link } from "@/i18n/navigation";
import { formatDateShort } from "@/lib/utils/date";

export const dynamic = "force-dynamic";

export default async function EventsListPage() {
  const payload = await getPayload({ config: configPromise });

  // Fetch published events
  const { docs: events } = await payload.find({
    collection: "events",
    overrideAccess: false,
    limit: 50,
    sort: "-eventTimestamp",
    where: { _status: { equals: "published" } },
    depth: 1, // Include dataset info
  });

  const t = await getTranslations("Events");

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">{t("title")}</h1>

      {events.length === 0 ? (
        <p className="text-gray-500">{t("noEventsFound")}</p>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const eventData = event.originalData as Record<string, unknown>;
            const title =
              (typeof eventData.title === "string" && eventData.title) ||
              (typeof eventData.name === "string" && eventData.name) ||
              `Event ${event.id}`;
            const dataset = typeof event.dataset === "object" ? event.dataset : null;

            return (
              <Link
                key={event.id}
                href={`/events/${event.id}`}
                className="block rounded-lg border p-4 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="mb-1 text-xl font-semibold">{title}</h2>
                    <div className="space-y-1 text-sm text-gray-600">
                      {event.eventTimestamp != null && (
                        <p>
                          {t("date")}: {formatDateShort(event.eventTimestamp)}
                        </p>
                      )}
                      {dataset != null && (
                        <p>
                          {t("dataset")}: {dataset.name}
                        </p>
                      )}
                      {event.location != null &&
                        (event.location.latitude != null || event.location.longitude != null) && (
                          <p>
                            {t("location")}: {event.location.latitude?.toFixed(4)},{" "}
                            {event.location.longitude?.toFixed(4)}
                          </p>
                        )}
                    </div>
                  </div>
                  <div className="text-sm">
                    {event.validationStatus === "valid" ? (
                      <span className="text-green-600">✓ {t("valid")}</span>
                    ) : (
                      <span className="text-red-600">✗ {t("invalid")}</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-8 text-sm text-gray-500">
        <p>{t("showingRecentEvents")}</p>
      </div>
    </div>
  );
}

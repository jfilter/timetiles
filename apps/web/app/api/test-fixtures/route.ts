/**
 * Test fixture endpoint that serves CSV data for E2E tests.
 *
 * Only exposed when `E2E_MODE=true` (see `lib/utils/is-e2e.ts`). Real prod
 * deploys and local dev both 404 here — the endpoint is exclusively for E2E.
 *
 * @module
 * @category API Routes
 */

import { isE2E } from "@/lib/utils/is-e2e";

// Use lat/lon columns instead of address — skips geocoding (coordinates used directly)
const CSV_DATA = `title,description,date,latitude,longitude,category
Workshop on AI,Hands-on workshop covering practical AI applications,2025-06-01,52.5200,13.4050,technology
Summer Jazz Night,Open-air jazz concert in the park,2025-06-15,52.5280,13.4430,music
Street Food Festival,International street food from 30 vendors,2025-07-01,52.5030,13.4290,food`;

const JSON_DATA = [
  {
    title: "Workshop on AI",
    description: "Hands-on workshop covering practical AI applications",
    date: "2025-06-01",
    latitude: 52.52,
    longitude: 13.405,
    category: "technology",
  },
  {
    title: "Summer Jazz Night",
    description: "Open-air jazz concert in the park",
    date: "2025-06-15",
    latitude: 52.528,
    longitude: 13.443,
    category: "music",
  },
  {
    title: "Street Food Festival",
    description: "International street food from 30 vendors",
    date: "2025-07-01",
    latitude: 52.503,
    longitude: 13.429,
    category: "food",
  },
];

export const GET = (request: Request) => {
  if (!isE2E()) {
    return new Response("Not found", { status: 404 });
  }

  if (new URL(request.url).searchParams.get("format") === "json") {
    return Response.json(JSON_DATA, { headers: { "Content-Disposition": "inline; filename=scheduled-events.json" } });
  }

  return new Response(CSV_DATA, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "inline; filename=scheduled-events.csv" },
  });
};

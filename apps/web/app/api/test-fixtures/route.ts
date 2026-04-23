/**
 * Test fixture endpoint that serves CSV data for E2E tests.
 *
 * Only exposed when `E2E_MODE=true` (see `lib/utils/is-e2e.ts`). Real prod
 * deploys and local dev both 404 here — the endpoint is exclusively for E2E.
 *
 * Each call returns rows with a monotonically increasing `runId` so that
 * scheduled ingests re-fetching this URL see fresh content and don't trip
 * the duplicate-rate review gate.
 *
 * @module
 * @category API Routes
 */

import { isE2E } from "@/lib/utils/is-e2e";

interface FixtureRow {
  title: string;
  description: string;
  date: string;
  latitude: string;
  longitude: string;
  category: string;
}

const BASE_ROWS: readonly FixtureRow[] = [
  {
    title: "Workshop on AI",
    description: "Hands-on workshop covering practical AI applications",
    date: "2025-06-01",
    latitude: "52.5200",
    longitude: "13.4050",
    category: "technology",
  },
  {
    title: "Summer Jazz Night",
    description: "Open-air jazz concert in the park",
    date: "2025-06-15",
    latitude: "52.5280",
    longitude: "13.4430",
    category: "music",
  },
  {
    title: "Street Food Festival",
    description: "International street food from 30 vendors",
    date: "2025-07-01",
    latitude: "52.5030",
    longitude: "13.4290",
    category: "food",
  },
];

let fixtureCallCount = 0;

const buildCsv = (runId: number): string => {
  const header = "title,description,date,latitude,longitude,category";
  const rows = BASE_ROWS.map(
    (row) => `${row.title} #${runId},${row.description},${row.date},${row.latitude},${row.longitude},${row.category}`
  );
  return [header, ...rows].join("\n");
};

export const GET = () => {
  if (!isE2E()) {
    return new Response("Not found", { status: 404 });
  }
  fixtureCallCount += 1;
  return new Response(buildCsv(fixtureCallCount), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "inline; filename=scheduled-events.csv" },
  });
};

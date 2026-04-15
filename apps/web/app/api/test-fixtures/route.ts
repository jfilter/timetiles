/**
 * Test fixture endpoint that serves CSV data for E2E tests.
 *
 * E2E runs a production-built server, where `next build` inlines
 * `process.env.NODE_ENV` as "production". `E2E_TEST_FIXTURES` is read via
 * bracket notation so Next.js doesn't inline it at build time — the value is
 * checked at runtime, matching the pattern used in `lib/security/url-validation.ts`.
 *
 * @module
 * @category API Routes
 */

// Use lat/lon columns instead of address — skips geocoding (coordinates used directly)
const CSV_DATA = `title,description,date,latitude,longitude,category
Workshop on AI,Hands-on workshop covering practical AI applications,2025-06-01,52.5200,13.4050,technology
Summer Jazz Night,Open-air jazz concert in the park,2025-06-15,52.5280,13.4430,music
Street Food Festival,International street food from 30 vendors,2025-07-01,52.5030,13.4290,food`;

export const GET = () => {
  const isE2E = process.env["E2E_TEST_FIXTURES"] === "true";
  if (process.env.NODE_ENV === "production" && !isE2E) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(CSV_DATA, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": "inline; filename=scheduled-events.csv" },
  });
};

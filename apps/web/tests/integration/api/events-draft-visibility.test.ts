/**
 * Integration tests for draft events on the SQL-backed event endpoints.
 *
 * A public dataset holds published and draft events. Anonymous callers must get
 * the same published-only total from the Payload list path, the SQL list path,
 * the bounds aggregate and the histogram function; the catalog owner still
 * counts their own drafts everywhere.
 *
 * @module
 * @category Integration Tests
 */
import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as boundsGet } from "@/app/api/v1/events/bounds/route";
import { GET as eventsGet } from "@/app/api/v1/events/route";
import { GET as temporalGet } from "@/app/api/v1/events/temporal/route";

import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import type { TestEnvironment } from "../../setup/integration/environment";

type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, never>> }) => Promise<Response>;

const PUBLISHED_COUNT = 3;
const DRAFT_COUNT = 2;

describe.sequential("Draft events on SQL-backed event endpoints", () => {
  let payload: Payload;
  let testEnv: TestEnvironment;
  let datasetId: number;
  let ownerToken: string;
  const publishedIds: number[] = [];

  const call = async (handler: RouteHandler, path: string, token?: string) => {
    const headers: HeadersInit = token ? { Authorization: `JWT ${token}` } : {};
    const response = await handler(new NextRequest(`http://localhost:3000${path}`, { headers }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    return response.json();
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    const { users } = await withUsers(testEnv, { owner: { role: "user", _verified: true } });
    const { catalog } = await withCatalog(testEnv, { isPublic: true, user: users.owner });
    const { dataset } = await withDataset(testEnv, catalog.id, { isPublic: true });
    datasetId = dataset.id;

    const runId = crypto.randomUUID().slice(0, 8);
    for (let i = 0; i < PUBLISHED_COUNT + DRAFT_COUNT; i++) {
      const isDraft = i >= PUBLISHED_COUNT;
      const event = await payload.create({
        collection: "events",
        data: {
          uniqueId: `draft-visibility-${runId}-${i}`,
          dataset: datasetId,
          sourceData: { title: `Event ${i}` },
          transformedData: { title: `Event ${i}` },
          location: { latitude: 48 + i * 0.1, longitude: 11 + i * 0.1 },
          eventTimestamp: new Date(2024, 2, 1 + i).toISOString(),
          _status: isDraft ? "draft" : "published",
        },
      });
      if (!isDraft) publishedIds.push(event.id);
    }

    const login = await payload.login({
      collection: "users",
      data: { email: users.owner.email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    ownerToken = login.token ?? "";
    expect(ownerToken).not.toBe("");
  }, 120000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  describe("anonymous", () => {
    it.each([
      ["Payload", ""],
      ["SQL", "&sort=title"],
    ])("lists only published events on the %s path with a matching total", async (_label, extra) => {
      const data = await call(eventsGet, `/api/v1/events?datasets=${datasetId}${extra}`);

      expect(data.pagination.totalDocs).toBe(PUBLISHED_COUNT);
      const ids: number[] = data.events.map((event: { id: number }) => event.id);
      expect(ids).toHaveLength(PUBLISHED_COUNT);
      expect(new Set(ids)).toEqual(new Set(publishedIds));
    });

    it("counts only published events in bounds and histogram", async () => {
      const bounds = await call(boundsGet, `/api/v1/events/bounds?datasets=${datasetId}`);
      const temporal = await call(temporalGet, `/api/v1/events/temporal?datasets=${datasetId}`);

      expect(bounds.count).toBe(PUBLISHED_COUNT);
      expect(temporal.metadata.total).toBe(PUBLISHED_COUNT);
    });
  });

  describe("catalog owner", () => {
    it.each([
      ["Payload", ""],
      ["SQL", "&sort=title"],
    ])("lists the own drafts on the %s path", async (_label, extra) => {
      const data = await call(eventsGet, `/api/v1/events?datasets=${datasetId}${extra}`, ownerToken);

      expect(data.pagination.totalDocs).toBe(PUBLISHED_COUNT + DRAFT_COUNT);
      expect(data.events).toHaveLength(PUBLISHED_COUNT + DRAFT_COUNT);
    });

    it("counts the own drafts in bounds and histogram", async () => {
      const bounds = await call(boundsGet, `/api/v1/events/bounds?datasets=${datasetId}`, ownerToken);
      const temporal = await call(temporalGet, `/api/v1/events/temporal?datasets=${datasetId}`, ownerToken);

      expect(bounds.count).toBe(PUBLISHED_COUNT + DRAFT_COUNT);
      expect(temporal.metadata.total).toBe(PUBLISHED_COUNT + DRAFT_COUNT);
    });
  });
});

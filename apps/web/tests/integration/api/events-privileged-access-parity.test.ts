/**
 * The public event API is scoped to public-or-owned for EVERY caller, admins included.
 *
 * `events.access.read` does grant an admin unrestricted read, but that bypass belongs to the
 * admin panel: the explore endpoints narrow through the canonical filters
 * (`includePublic` / `ownerId`) before Payload access ever runs, and the SQL adapter and the
 * three PL/pgSQL functions mirror that same grant. A "fix" that let the SQL path bypass it
 * would have made one request return more rows than the identical request on the Payload path
 * — this pins all four paths to the one policy.
 *
 * @module
 * @category Integration Tests
 */
import { randomUUID } from "node:crypto";

import { NextRequest } from "next/server";
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as geoGet } from "../../../app/api/v1/events/geo/route";
import { GET as eventsGet } from "../../../app/api/v1/events/route";
import { GET as temporalGet } from "../../../app/api/v1/events/temporal/route";
import { TEST_CREDENTIALS } from "../../constants/test-credentials";
import type { TestEnvironment } from "../../setup/integration/environment";

const WORLD_BOUNDS = { north: 90, south: -90, east: 180, west: -180 };

/** Integration projects run with `retry: 2`; a fixed uniqueId makes the retry fail on a
 *  duplicate key instead of the assertion that actually broke. */
const RUN_ID = randomUUID().slice(0, 8);

describe.sequential("privileged access parity across event endpoints", () => {
  let payload: Payload;
  let privateDatasetId: number;
  let adminToken: string;
  let ownerToken: string;
  let testEnv: TestEnvironment;

  const authHeaders = (token?: string): HeadersInit => (token ? { Authorization: `JWT ${token}` } : {});

  const listTotal = async (token?: string): Promise<number> => {
    const url = `http://localhost:3000/api/v1/events?datasets=${privateDatasetId}&limit=50`;
    const response = await eventsGet(new NextRequest(url, { headers: authHeaders(token) }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { pagination: { totalDocs: number } };
    return data.pagination.totalDocs;
  };

  const mapTotal = async (token?: string): Promise<number> => {
    const url =
      `http://localhost:3000/api/v1/events/geo?datasets=${privateDatasetId}&zoom=2` +
      `&bounds=${encodeURIComponent(JSON.stringify(WORLD_BOUNDS))}`;
    const response = await geoGet(new NextRequest(url, { headers: authHeaders(token) }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { features: Array<{ properties: { count: number } }> };
    return data.features.reduce((sum, feature) => sum + Number(feature.properties.count), 0);
  };

  const histogramTotal = async (token?: string): Promise<number> => {
    const url = `http://localhost:3000/api/v1/events/temporal?datasets=${privateDatasetId}`;
    const response = await temporalGet(new NextRequest(url, { headers: authHeaders(token) }), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { metadata: { total: number } };
    return data.metadata.total;
  };

  beforeAll(async () => {
    const { createIntegrationTestEnvironment, withCatalog, withDataset, withUsers } =
      await import("../../setup/integration/environment");
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;

    // The admin is verified so `payload.login()` issues a token — these endpoints authenticate
    // off the request headers, not off a Payload local-API user object.
    const { users } = await withUsers(testEnv, {
      owner: { role: "user", _verified: true },
      siteAdmin: { role: "admin", _verified: true },
    });

    // Private catalog owned by somebody OTHER than the admin.
    const { catalog } = await withCatalog(testEnv, {
      name: "Privileged Parity Catalog",
      isPublic: false,
      user: users.owner,
    });
    const { dataset } = await withDataset(testEnv, catalog.id, { name: "Privileged Parity Dataset", isPublic: false });
    privateDatasetId = dataset.id;

    for (let i = 0; i < 3; i++) {
      await payload.create({
        collection: "events",
        data: {
          uniqueId: `privileged-parity-${i}-${RUN_ID}`,
          dataset: privateDatasetId,
          sourceData: { title: `Private ${i}` },
          transformedData: { title: `Private ${i}` },
          location: { latitude: 40 + i * 0.5, longitude: -74 + i * 0.5 },
          eventTimestamp: new Date(2024, 0, 1 + i).toISOString(),
        },
      });
    }

    const tokenFor = async (email: string): Promise<string> => {
      const login = await payload.login({
        collection: "users",
        data: { email, password: TEST_CREDENTIALS.basic.strongPassword },
      });
      return login.token ?? "";
    };

    adminToken = await tokenFor(users.siteAdmin.email);
    ownerToken = await tokenFor(users.owner.email);
    expect(adminToken).not.toBe("");
    expect(ownerToken).not.toBe("");
  });

  afterAll(async () => {
    if (testEnv?.cleanup) await testEnv.cleanup();
  });

  it("hides another user's private events from an admin on list, map and histogram alike", async () => {
    expect(await listTotal(adminToken)).toBe(0);
    expect(await mapTotal(adminToken)).toBe(0);
    expect(await histogramTotal(adminToken)).toBe(0);
  });

  it("hides them from an anonymous caller everywhere too", async () => {
    expect(await listTotal()).toBe(0);
    expect(await mapTotal()).toBe(0);
    expect(await histogramTotal()).toBe(0);
  });

  // The same rows, reached through the SQL path instead of the Payload path. Divergence here
  // is what a privileged bypass in only one adapter would look like.
  it("gives the same answer when a custom sort forces the SQL path", async () => {
    const url = `http://localhost:3000/api/v1/events?datasets=${privateDatasetId}&limit=50&sort=title`;
    const response = await eventsGet(new NextRequest(url, { headers: authHeaders(adminToken) }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { pagination: { totalDocs: number } };
    expect(data.pagination.totalDocs).toBe(0);
  });

  it("shows the owner their own private events on every path", async () => {
    expect(await listTotal(ownerToken)).toBe(3);
    expect(await mapTotal(ownerToken)).toBe(3);
    expect(await histogramTotal(ownerToken)).toBe(3);
  });
});

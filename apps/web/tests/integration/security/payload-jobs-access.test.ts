/**
 * Native Payload job endpoints and access controls must be admin-only.
 * Collection permissions do not guard the job system's separate endpoints.
 *
 * @module
 * @category Integration Tests
 */
import { createLocalReq, type Payload } from "payload";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { PayloadJobsStat, User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Native Payload job access", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let users: Record<string, User>;
  let originalStats: PayloadJobsStat["stats"];

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = env.payload;
    ({ users } = await withUsers(env, {
      regular: { role: "user" },
      editor: { role: "editor" },
      admin: { role: "admin" },
    }));
  });

  afterAll(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    originalStats = (await payload.findGlobal({ slug: "payload-jobs-stats" })).stats;
  });

  afterEach(async () => {
    await payload.updateGlobal({ slug: "payload-jobs-stats", data: { stats: originalStats ?? null } });
  });

  it.each(["anonymous", "regular", "editor", "admin"])("rejects scheduler-state writes from %s", async (role) => {
    await expect(
      payload.updateGlobal({
        slug: "payload-jobs-stats",
        overrideAccess: false,
        user: users[role],
        data: {
          stats: {
            scheduledRuns: {
              queues: { default: { tasks: { "schedule-manager": { lastScheduledRun: "2099-01-01T00:00:00.000Z" } } } },
            },
          },
        },
      })
    ).rejects.toMatchObject({ status: 403 });
    expect((await payload.findGlobal({ slug: "payload-jobs-stats" })).stats).toEqual(originalStats);
  });

  it.each(["anonymous", "regular", "editor"])("rejects scheduler-state reads from %s", async (role) => {
    await expect(
      payload.findGlobal({ slug: "payload-jobs-stats", overrideAccess: false, user: users[role] })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("still lets Payload schedule jobs and persist its own scheduling state", async () => {
    await payload.updateGlobal({ slug: "payload-jobs-stats", data: { stats: {} } });
    const result = await payload.jobs.handleSchedules({ queue: "default" });

    expect(result.errored).toHaveLength(0);
    expect(result.queued.length).toBeGreaterThan(0);
    const stored = await payload.findGlobal({ slug: "payload-jobs-stats", overrideAccess: false, user: users.admin });
    expect(stored.stats).toMatchObject({
      scheduledRuns: {
        queues: { default: { tasks: { "schedule-manager": { lastScheduledRun: expect.any(String) } } } },
      },
    });
  });

  it.each(["/run", "/handle-schedules"])("restricts native %s to admins", async (path) => {
    const endpoints = payload.collections["payload-jobs"].config.endpoints;
    const endpoint = endpoints && endpoints.find((candidate) => candidate.path === path && candidate.method === "get");
    expect(endpoint).toBeTruthy();
    if (!endpoint) throw new Error(`Missing native endpoint ${path}`);

    for (const [role, expected] of [
      ["anonymous", 401],
      ["regular", 401],
      ["editor", 401],
      ["admin", 200],
    ] as const) {
      const req = await createLocalReq({ user: users[role] }, payload);
      // No jobs or schedules exist for this queue: authorization is tested without running unrelated work.
      req.query = { queue: "access-regression-empty" };
      const response = await endpoint.handler(req);
      expect(response.status, role).toBe(expected);
    }
  });

  it.each(["run", "queue", "cancel"] as const)("restricts jobs.access.%s to admins", async (operation) => {
    const access = payload.config.jobs.access?.[operation];
    expect(access).toBeDefined();
    if (!access) throw new Error(`Missing ${operation} access`);
    for (const role of ["anonymous", "regular", "editor", "admin"]) {
      const req = await createLocalReq({ user: users[role] }, payload);
      expect(await access({ req }), role).toBe(role === "admin");
    }
  });
});

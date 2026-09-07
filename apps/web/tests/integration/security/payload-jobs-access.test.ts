/**
 * Native Payload job endpoints and access controls must be admin-only.
 * Collection permissions do not guard the job system's separate endpoints.
 *
 * @module
 * @category Integration Tests
 */
import { createLocalReq, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Native Payload job access", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let users: Record<string, User>;

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

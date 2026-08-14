// @vitest-environment node
/**
 * Regression tests for issue #168: `POST /api/users` returned an opaque 500
 * for what should have been an ordinary 400/403 rejection.
 *
 * Root cause: `usersBeforeChangeHook` threw `AppError` (from `lib/types/errors.ts`),
 * whose status lives on `.statusCode` — the contract `apiRoute()`'s `handleError`
 * reads. But these hooks run inside Payload's own create/update operation, reached
 * through the auto-generated REST endpoint, and Payload's `routeError` reads
 * `.status` instead. `AppError` never sets it, so `err.status` was `undefined` and
 * Payload fell back to 500 regardless of the intended code. Payload's own `APIError`
 * (already used elsewhere in this same file) sets `.status` correctly.
 *
 * These tests exercise the real, auto-generated `/api/users` REST endpoint (the
 * catch-all route Payload generates), not the Local API — the Local API bypasses
 * this class of bug because `apiRoute()` handlers are never involved either way.
 *
 * @module
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PATCH as restPATCH, POST as restPOST } from "@/app/(payload)/api/[...slug]/route";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Users collection hook errors surface the right REST status (issue #168)", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let adminToken: string;
  let regularToken: string;
  let regularUserId: number;

  beforeAll(async () => {
    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    const { users } = await withUsers(env, {
      admin: { role: "admin", _verified: true },
      regular: { role: "user", _verified: true },
    });
    regularUserId = users.regular.id;

    const tokenFor = async (email: string): Promise<string> => {
      const login = await payload.login({
        collection: "users",
        data: { email, password: TEST_CREDENTIALS.basic.strongPassword },
      });
      return login.token ?? "";
    };
    adminToken = await tokenFor(users.admin.email);
    regularToken = await tokenFor(users.regular.email);
    expect(adminToken).not.toBe("");
    expect(regularToken).not.toBe("");
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("returns 400 (not 500) when an admin REST-creates a user with a policy-violating password", async () => {
    const email = `weak-password-${Date.now()}@example.com`;
    const request = new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `JWT ${adminToken}` },
      body: JSON.stringify({ email, password: TEST_CREDENTIALS.security.short, role: "user" }),
    });

    const response = await restPOST(request, { params: Promise.resolve({ slug: ["users"] }) });
    const body = (await response.json()) as { errors?: { message: string }[] };

    expect(response.status).toBe(400);
    expect(body.errors?.[0]?.message).toMatch(/at least \d+ characters/i);

    const check = await payload.find({
      collection: "users",
      where: { email: { equals: email } },
      overrideAccess: true,
    });
    expect(check.docs).toHaveLength(0);
  });

  it("returns 403 (not 500) when a non-admin REST-updates their own login email", async () => {
    const request = new NextRequest(`http://localhost:3000/api/users/${regularUserId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `JWT ${regularToken}` },
      body: JSON.stringify({ email: "takeover-attempt@example.com" }),
    });

    const response = await restPATCH(request, { params: Promise.resolve({ slug: ["users", String(regularUserId)] }) });
    const body = (await response.json()) as { errors?: { message: string }[] };

    expect(response.status).toBe(403);
    expect(body.errors?.[0]?.message).toMatch(/dedicated endpoints/i);

    const unchanged = await payload.findByID({ collection: "users", id: regularUserId, overrideAccess: true });
    expect(unchanged.email).not.toBe("takeover-attempt@example.com");
  });
});

// @vitest-environment node
/**
 * Security tests for `POST /api/geocoding/test`.
 *
 * The route makes the server dispatch outbound requests to every configured
 * geocoding provider with a caller-supplied address, so it is admin-only. A
 * regression that relaxes `auth: "admin"` to `"required"` would hand every
 * account (including editors) a request-dispatching, rate-limit-consuming
 * endpoint.
 *
 * @module
 */

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as geocodingTestPOST } from "@/app/api/geocoding/test/route";
import { resetEnv } from "@/lib/config/env";
import type { User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe.sequential("Geocoding test endpoint authorization", () => {
  let payload: any;
  let cleanup: () => Promise<void>;

  let plainUser: User;
  let editorUser: User;
  let adminUser: User;

  const loginToken = async (email: string): Promise<string> => {
    const result = await payload.login({
      collection: "users",
      data: { email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    expect(result.token).toBeDefined();
    return result.token as string;
  };

  const callGeocodingTest = async (token?: string, address: unknown = "1 Test Street"): Promise<Response> => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token != null) headers.set("Authorization", `Bearer ${token}`);
    const request = new NextRequest("http://localhost:3000/api/geocoding/test", {
      method: "POST",
      headers,
      body: JSON.stringify({ address }),
    });
    return geocodingTestPOST(request, { params: Promise.resolve({}) });
  };

  beforeAll(async () => {
    vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
    resetEnv();

    const env = await createIntegrationTestEnvironment();
    payload = env.payload;
    cleanup = env.cleanup;

    const { users } = await withUsers(env, {
      geoUser: { role: "user", _verified: true },
      geoEditor: { role: "editor", _verified: true },
      geoAdmin: { role: "admin", _verified: true },
    });
    plainUser = users.geoUser;
    editorUser = users.geoEditor;
    adminUser = users.geoAdmin;
  }, 90000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    resetEnv();
    await cleanup();
  });

  it("rejects an anonymous caller with 401", async () => {
    const response = await callGeocodingTest();

    expect(response.status).toBe(401);
  });

  it("rejects a forged token with 401", async () => {
    const response = await callGeocodingTest(TEST_CREDENTIALS.bearer.jwtInvalid);

    expect(response.status).toBe(401);
  });

  it("rejects a plain authenticated user with 403", async () => {
    const token = await loginToken(plainUser.email);

    const response = await callGeocodingTest(token);

    expect(response.status).toBe(403);
  });

  it("rejects an editor with 403", async () => {
    const token = await loginToken(editorUser.email);

    const response = await callGeocodingTest(token);

    expect(response.status).toBe(403);
  });

  it("lets an admin past the role gate", async () => {
    const token = await loginToken(adminUser.email);

    // An empty address fails body validation (422), which happens strictly
    // AFTER the auth/role gate: it proves the admin got through without the
    // handler dispatching any outbound provider request.
    const response = await callGeocodingTest(token, "");

    expect(response.status).toBe(422);
  });
});

// @vitest-environment node
/**
 * Security tests for the data-package API routes.
 *
 * `GET /api/data-packages` is reachable anonymously (`auth: "optional"`) and
 * serves manifests that may carry real credentials, so the route strips
 * `source.auth` down to its `type`. `POST /api/data-packages/[slug]/activate`
 * creates a recurring remote fetch and is therefore gated on the
 * `enableScheduledIngests` flag — a deny that outranks the role check.
 *
 * The fixture manifest is written into the real manifest directory so the
 * production loader (including its `$ENV:` resolution) is what feeds the route.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as activatePOST } from "@/app/api/data-packages/[slug]/activate/route";
import { GET as listGET } from "@/app/api/data-packages/route";
import { resetFeatureFlagService } from "@/lib/services/feature-flag-service";
import type { User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

const PACKAGE_SLUG = "zz-security-fixture-package";

const SECRET_API_KEY = TEST_CREDENTIALS.apiKey.secretKey;
const SECRET_BEARER = TEST_CREDENTIALS.bearer.superSecretToken;
const SECRET_PASSWORD = TEST_CREDENTIALS.basic.superSecretPassword;
const SECRET_HEADER_VALUE = TEST_CREDENTIALS.apiKey.customKey;

const MANIFEST_YAML = `slug: ${PACKAGE_SLUG}
title: Security Fixture Package
summary: Fixture package carrying credentials, used to prove they are never served.
category: test

source:
  url: "https://example.com/security-fixture.json"
  format: json
  auth:
    type: api-key
    apiKey: "${SECRET_API_KEY}"
    apiKeyHeader: X-API-Key
    bearerToken: "${SECRET_BEARER}"
    username: fixture-user
    password: "${SECRET_PASSWORD}"
    customHeaders:
      X-Fixture-Secret: "${SECRET_HEADER_VALUE}"

catalog:
  name: Security Fixture Catalog
  isPublic: false

dataset:
  name: Security Fixture Dataset
  language: eng

fieldMappings: {}

schedule:
  type: frequency
  frequency: weekly
  schemaMode: additive
  timezone: UTC
`;

interface PackageListResponse {
  packages: { slug: string; source: { auth?: Record<string, unknown> } }[];
}

describe.sequential("Data package API security", () => {
  let payload: any;
  let cleanup: () => Promise<void>;
  let testEnv: any;

  let adminUser: User;
  let plainUser: User;

  let manifestPath: string;

  const loginToken = async (email: string): Promise<string> => {
    const result = await payload.login({
      collection: "users",
      data: { email, password: TEST_CREDENTIALS.basic.strongPassword },
    });
    expect(result.token).toBeDefined();
    return result.token as string;
  };

  const callList = async (token?: string): Promise<Response> => {
    const headers = new Headers();
    if (token != null) headers.set("Authorization", `Bearer ${token}`);
    const request = new NextRequest("http://localhost:3000/api/data-packages", { headers });
    return listGET(request, { params: Promise.resolve({}) });
  };

  const callActivate = async (slug: string, token?: string): Promise<Response> => {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token != null) headers.set("Authorization", `Bearer ${token}`);
    const request = new NextRequest(`http://localhost:3000/api/data-packages/${slug}/activate`, {
      method: "POST",
      headers,
      body: JSON.stringify({ triggerFirstImport: false }),
    });
    return activatePOST(request, { params: Promise.resolve({ slug }) });
  };

  const setScheduledIngestsEnabled = async (enabled: boolean): Promise<void> => {
    await payload.updateGlobal({ slug: "settings", data: { featureFlags: { enableScheduledIngests: enabled } } });
    // The flag service caches for a minute in-process; drop it so the route
    // handler reads the value this test just wrote.
    resetFeatureFlagService();
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    // Mirror the loader's directory resolution so the fixture lands where the
    // route will actually read it from.
    const devDir = path.resolve("apps/web/config/data-packages");
    const dir = fs.existsSync(devDir) ? devDir : path.resolve("config/data-packages");
    manifestPath = path.join(dir, `${PACKAGE_SLUG}.yml`);
    fs.writeFileSync(manifestPath, MANIFEST_YAML, "utf8");

    const { users } = await withUsers(testEnv, {
      dpAdmin: { role: "admin", _verified: true },
      dpUser: { role: "user", _verified: true },
    });
    adminUser = users.dpAdmin;
    plainUser = users.dpUser;
  }, 90000);

  afterAll(async () => {
    fs.rmSync(manifestPath, { force: true });
    await setScheduledIngestsEnabled(true);
    await cleanup();
  });

  describe("GET /api/data-packages credential stripping", () => {
    it("serves the fixture package but no credential material to an anonymous caller", async () => {
      const response = await callList();
      expect(response.status).toBe(200);

      const raw = await response.text();
      const body = JSON.parse(raw) as PackageListResponse;
      const fixture = body.packages.find((p) => p.slug === PACKAGE_SLUG);

      // Positive control: the package IS in the payload, so the absence of the
      // secrets below is stripping and not an empty response.
      expect(fixture).toBeDefined();
      expect(fixture?.source.auth).toEqual({ type: "api-key" });

      for (const secret of [SECRET_API_KEY, SECRET_BEARER, SECRET_PASSWORD, SECRET_HEADER_VALUE]) {
        expect(raw).not.toContain(secret);
      }
      expect(raw).not.toContain("customHeaders");
    });

    it("serves no credential material to an authenticated non-admin either", async () => {
      const token = await loginToken(plainUser.email);

      const response = await callList(token);
      expect(response.status).toBe(200);

      const raw = await response.text();
      for (const secret of [SECRET_API_KEY, SECRET_BEARER, SECRET_PASSWORD, SECRET_HEADER_VALUE]) {
        expect(raw).not.toContain(secret);
      }
    });

    it("serves no credential material to an admin", async () => {
      const token = await loginToken(adminUser.email);

      const response = await callList(token);
      expect(response.status).toBe(200);

      const raw = await response.text();
      for (const secret of [SECRET_API_KEY, SECRET_BEARER, SECRET_PASSWORD, SECRET_HEADER_VALUE]) {
        expect(raw).not.toContain(secret);
      }
    });
  });

  describe("POST /api/data-packages/[slug]/activate feature gate", () => {
    it("rejects an anonymous activation with 401", async () => {
      await setScheduledIngestsEnabled(true);

      const response = await callActivate(PACKAGE_SLUG);

      expect(response.status).toBe(401);
    });

    it("denies an admin while scheduled imports are disabled", async () => {
      await setScheduledIngestsEnabled(false);
      const token = await loginToken(adminUser.email);

      const response = await callActivate(PACKAGE_SLUG, token);

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error?: string; message?: string };
      expect(JSON.stringify(body)).toMatch(/disabled/i);
    });

    it("denies a plain user while scheduled imports are disabled", async () => {
      await setScheduledIngestsEnabled(false);
      const token = await loginToken(plainUser.email);

      const response = await callActivate(PACKAGE_SLUG, token);

      expect(response.status).toBe(403);
    });

    it("creates nothing while the flag is off", async () => {
      const schedules = await payload.find({
        collection: "scheduled-ingests",
        where: { dataPackageSlug: { equals: PACKAGE_SLUG } },
        overrideAccess: true,
      });

      expect(schedules.docs).toHaveLength(0);
    });

    it("allows activation once the flag is on", async () => {
      await setScheduledIngestsEnabled(true);
      const token = await loginToken(adminUser.email);

      const response = await callActivate(PACKAGE_SLUG, token);

      expect(response.status).toBe(200);

      const schedules = await payload.find({
        collection: "scheduled-ingests",
        where: { dataPackageSlug: { equals: PACKAGE_SLUG } },
        overrideAccess: true,
      });
      expect(schedules.docs.length).toBeGreaterThan(0);
    });
  });
});

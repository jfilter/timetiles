/**
 * Sync status exposes only pending work for a manageable repository.
 *
 * @module
 * @category Tests
 */
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/scraper-repos/[id]/sync/route";
import { resetFeatureFlagService } from "@/lib/services/feature-flag-service";
import type { User } from "@/payload-types";
import { TEST_CREDENTIALS } from "@/tests/constants/test-credentials";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("Scraper sync status", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let owner: User;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment();
    const { users } = await withUsers(env, {
      owner: { role: "user", trustLevel: "3", _verified: true, password: TEST_CREDENTIALS.auth.secure },
      other: { role: "user", trustLevel: "3", _verified: true, password: TEST_CREDENTIALS.auth.secure },
    });
    owner = users.owner;
    const login = async (user: User) => {
      const result = await env.payload.login({
        collection: "users",
        data: { email: user.email, password: TEST_CREDENTIALS.auth.secure },
      });
      return result.token!;
    };
    ownerToken = await login(owner);
    otherToken = await login(users.other);
  });

  beforeEach(async () => {
    await env.seedManager.truncate(["scraper-repos", "scrapers", "scraper-runs", "payload-jobs", "user-usage"]);
    await env.payload.updateGlobal({ slug: "settings", data: { featureFlags: { enableScrapers: true } } });
    resetFeatureFlagService();
  });

  afterAll(async () => {
    await env.payload.updateGlobal({ slug: "settings", data: { featureFlags: { enableScrapers: false } } });
    resetFeatureFlagService();
    await env.cleanup?.();
  });

  const createRepo = () =>
    env.payload.create({
      collection: "scraper-repos",
      data: { name: "Sync status", sourceType: "upload", code: { "main.py": "pass" } },
      user: owner,
      overrideAccess: false,
    });
  const status = (id: number, token?: string) =>
    GET(
      new NextRequest(`http://localhost:3000/api/scraper-repos/${id}/sync`, {
        headers: token ? { Authorization: `JWT ${token}` } : {},
      }),
      { params: Promise.resolve({ id: String(id) }) }
    );

  it("reports queued and running work without exposing job data", async () => {
    const repo = await createRepo();
    const queued = await status(repo.id, ownerToken);
    expect(queued.status).toBe(200);
    expect(await queued.json()).toEqual({ pending: true });
    const jobs = await env.payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "scraper-repo-sync" } },
    });
    await env.payload.update({ collection: "payload-jobs", id: jobs.docs[0]!.id, data: { processing: true } });
    expect(await (await status(repo.id, ownerToken)).json()).toEqual({ pending: true });
  });

  it.each(["failed", "completed", "deleted"] as const)("stops reporting %s work as pending", async (state) => {
    const repo = await createRepo();
    const jobs = await env.payload.find({
      collection: "payload-jobs",
      where: { taskSlug: { equals: "scraper-repo-sync" } },
    });
    const id = jobs.docs[0]!.id;
    if (state === "deleted") await env.payload.delete({ collection: "payload-jobs", id });
    else
      await env.payload.update({
        collection: "payload-jobs",
        id,
        data: state === "failed" ? { hasError: true } : { completedAt: new Date().toISOString() },
      });
    // Another repository's queued work must not keep this one pending.
    await createRepo();
    expect(await (await status(repo.id, ownerToken)).json()).toEqual({ pending: false });
  });

  it("rejects anonymous callers and another owner", async () => {
    const repo = await createRepo();
    expect((await status(repo.id)).status).toBe(401);
    expect((await status(repo.id, otherToken)).status).toBe(403);
  });
});

// @vitest-environment node
/**
 * Integration tests: pipeline/runtime state is not client-writable.
 *
 * Owners hold generic PATCH rights on scheduled-ingests and ingest-files, so
 * fields that steer the scheduler (`nextRun`, `lastStatus`, `currentRetries`)
 * or anchor ownership (`ingest-files.user`, `.catalog`) need protection beyond
 * `admin.readOnly`, which is UI-only.
 *
 * @module
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Pipeline field immutability", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;
  let owner: User;
  let other: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
    const { users } = await withUsers(testEnv, { owner: { role: "user" }, other: { role: "user" } });
    owner = users.owner;
    other = users.other;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  it("ignores a client-supplied nextRun and lastStatus on a scheduled ingest", async () => {
    const catalog = await payload.create({
      collection: "catalogs",
      data: { name: `Immutability Catalog ${Date.now()}`, isPublic: false, createdBy: owner.id },
      overrideAccess: true,
    });
    const schedule = await payload.create({
      collection: "scheduled-ingests",
      data: {
        name: `Immutability Schedule ${Date.now()}`,
        sourceUrl: "https://example.com/data.csv",
        catalog: catalog.id,
        createdBy: owner.id,
        enabled: true,
        scheduleType: "frequency",
        frequency: "daily",
      },
      overrideAccess: true,
    });

    const updated = await payload.update({
      collection: "scheduled-ingests",
      id: schedule.id,
      // A past nextRun would fire the import on the next scheduler tick; a
      // forged "running" status wedges the schedule.
      data: { nextRun: "2000-01-01T00:00:00.000Z", lastStatus: "running", currentRetries: 99 },
      user: owner,
      overrideAccess: false,
    });

    expect(updated.nextRun).not.toBe("2000-01-01T00:00:00.000Z");
    expect(updated.lastStatus).not.toBe("running");
    expect(updated.currentRetries ?? 0).not.toBe(99);
  });

  it("keeps ingest-file ownership and catalog fixed after create", async () => {
    const ownCatalog = await payload.create({
      collection: "catalogs",
      data: { name: `Own Catalog ${Date.now()}`, isPublic: false, createdBy: owner.id },
      overrideAccess: true,
    });
    const victimCatalog = await payload.create({
      collection: "catalogs",
      data: { name: `Victim Catalog ${Date.now()}`, isPublic: false, createdBy: other.id },
      overrideAccess: true,
    });
    const csvBuffer = Buffer.from("title,date\nEvent,2024-01-01\n");
    // `file` is not part of the generated create Options type, so this one call
    // goes through a narrowed handle rather than loosening the whole suite.
    const uploadPayload = payload as unknown as { create: (args: Record<string, unknown>) => Promise<{ id: number }> };
    const file = await uploadPayload.create({
      collection: "ingest-files",
      data: { catalog: ownCatalog.id },
      file: { data: csvBuffer, mimetype: "text/csv", name: `immutability-${Date.now()}.csv`, size: csvBuffer.length },
      user: owner,
      overrideAccess: false,
    });

    const updated = await payload.update({
      collection: "ingest-files",
      id: file.id,
      // Repointing catalog makes the (user-less) detection job create datasets
      // in the victim's catalog; repointing user hands over the file entirely.
      data: { catalog: victimCatalog.id, user: other.id, status: "completed" },
      user: owner,
      overrideAccess: false,
    });

    const catalogId = typeof updated.catalog === "object" ? updated.catalog?.id : updated.catalog;
    const userId = typeof updated.user === "object" ? updated.user?.id : updated.user;
    expect(catalogId).toBe(ownCatalog.id);
    expect(userId).toBe(owner.id);
    expect(updated.status).not.toBe("completed");
  });
});

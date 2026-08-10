// @vitest-environment node
/**
 * Integration tests: denormalized access-control fields are not client-writable.
 *
 * `catalogCreatorId` / `catalogIsPublic` (datasets) and `datasetIsPublic` /
 * `catalogOwnerId` (events) decide who may READ a row. They are derived in
 * beforeChange hooks — but that derivation only runs when the write carries the
 * parent relationship, so a PATCH omitting it must not be able to supply them.
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

describe.sequential("Denormalized access field forgery", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;
  let owner: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
    const { users } = await withUsers(testEnv, { owner: { role: "user" } });
    owner = users.owner;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  const createPrivateDataset = async (suffix: string) => {
    const catalog = await payload.create({
      collection: "catalogs",
      data: { name: `Forgery Catalog ${suffix}`, isPublic: false, createdBy: owner.id },
      overrideAccess: true,
    });
    const dataset = await payload.create({
      collection: "datasets",
      data: { name: `Forgery Dataset ${suffix}`, catalog: catalog.id, language: "eng", isPublic: false },
      overrideAccess: true,
    });
    return { catalog, dataset };
  };

  it("ignores a client-supplied catalogIsPublic on a dataset PATCH that omits catalog", async () => {
    const { dataset } = await createPrivateDataset("ds");

    const updated = await payload.update({
      collection: "datasets",
      id: dataset.id,
      data: { isPublic: true, catalogIsPublic: true },
      user: owner,
      overrideAccess: false,
    });

    // The catalog is private, so the dataset must stay invisible to the public
    // read filter (`isPublic AND catalogIsPublic`).
    expect(updated.catalogIsPublic).toBe(false);
  });

  it("ignores a client-supplied catalogCreatorId on a dataset PATCH", async () => {
    const { dataset } = await createPrivateDataset("owner");

    const updated = await payload.update({
      collection: "datasets",
      id: dataset.id,
      data: { catalogCreatorId: 999_999 },
      user: owner,
      overrideAccess: false,
    });

    expect(updated.catalogCreatorId).toBe(owner.id);
  });

  it("ignores a client-supplied datasetIsPublic on an event PATCH that omits dataset", async () => {
    const { dataset } = await createPrivateDataset("ev");
    const event = await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        sourceData: { title: "Private event" },
        transformedData: { title: "Private event" },
        uniqueId: `${dataset.id}:forgery:ev-${Date.now()}`,
      },
      overrideAccess: true,
    });
    expect(event.datasetIsPublic).toBe(false);

    const updated = await payload.update({
      collection: "events",
      id: event.id,
      data: { datasetIsPublic: true },
      user: owner,
      overrideAccess: false,
    });

    expect(updated.datasetIsPublic).toBe(false);
  });

  it("still cascades catalog visibility to datasets and events", async () => {
    const { catalog, dataset } = await createPrivateDataset("cascade");
    await payload.update({ collection: "datasets", id: dataset.id, data: { isPublic: true }, overrideAccess: true });
    const event = await payload.create({
      collection: "events",
      data: {
        dataset: dataset.id,
        sourceData: { title: "Cascade event" },
        transformedData: { title: "Cascade event" },
        uniqueId: `${dataset.id}:forgery:cascade-${Date.now()}`,
      },
      overrideAccess: true,
    });

    await payload.update({
      collection: "catalogs",
      id: catalog.id,
      data: { isPublic: true },
      user: owner,
      overrideAccess: false,
    });

    const syncedDataset = await payload.findByID({ collection: "datasets", id: dataset.id, overrideAccess: true });
    const syncedEvent = await payload.findByID({ collection: "events", id: event.id, overrideAccess: true });

    expect(syncedDataset.catalogIsPublic).toBe(true);
    expect(syncedEvent.datasetIsPublic).toBe(true);
  });
});

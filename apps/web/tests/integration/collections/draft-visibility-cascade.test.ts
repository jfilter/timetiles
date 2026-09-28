// @vitest-environment node
/**
 * Integration tests: draft saves of catalogs and datasets must not change the
 * denormalized access fields of live children.
 *
 * A draft save leaves the published row untouched, so events and schemas must
 * keep following the published visibility until the draft is published.
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

describe.sequential("Draft saves and the visibility cascade", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;
  let ownerUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;
    const { users } = await withUsers(testEnv, { owner: { role: "user", customQuotas: { maxCatalogsPerUser: 100 } } });
    ownerUser = users.owner;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  const createCatalog = async (isPublic: boolean) =>
    payload.create({
      collection: "catalogs",
      data: { _status: "published", name: `Draft cascade ${crypto.randomUUID()}`, isPublic, createdBy: ownerUser.id },
      overrideAccess: true,
    });

  const createDataset = async (catalogId: number) =>
    payload.create({
      collection: "datasets",
      data: {
        _status: "published",
        name: `Draft cascade ${crypto.randomUUID()}`,
        catalog: catalogId,
        language: "eng",
        isPublic: true,
      },
      overrideAccess: true,
    });

  const createEvent = async (datasetId: number) =>
    payload.create({
      collection: "events",
      data: {
        _status: "published",
        dataset: datasetId,
        sourceData: { test: "draft" },
        transformedData: { test: "draft" },
        uniqueId: `${datasetId}:draft:${crypto.randomUUID()}`,
      },
      overrideAccess: true,
    });

  const anonymousCanRead = async (eventId: number) => {
    const result = await payload.find({
      collection: "events",
      where: { id: { equals: eventId } },
      overrideAccess: false,
    });
    return result.docs.length === 1;
  };

  it("keeps events private while a catalog's public flag is only drafted", async () => {
    const catalog = await createCatalog(false);
    const dataset = await createDataset(catalog.id);
    const event = await createEvent(dataset.id);

    await payload.update({
      collection: "catalogs",
      id: catalog.id,
      draft: true,
      data: { isPublic: true },
      overrideAccess: true,
    });

    const liveCatalog = await payload.findByID({ collection: "catalogs", id: catalog.id, overrideAccess: true });
    expect(liveCatalog.isPublic).toBe(false);
    expect(
      (await payload.findByID({ collection: "datasets", id: dataset.id, overrideAccess: true })).catalogIsPublic
    ).toBe(false);
    expect((await payload.findByID({ collection: "events", id: event.id, overrideAccess: true })).datasetIsPublic).toBe(
      false
    );
    expect(await anonymousCanRead(event.id)).toBe(false);

    await payload.update({
      collection: "catalogs",
      id: catalog.id,
      data: { _status: "published" },
      overrideAccess: true,
    });

    expect((await payload.findByID({ collection: "events", id: event.id, overrideAccess: true })).datasetIsPublic).toBe(
      true
    );
    expect(await anonymousCanRead(event.id)).toBe(true);
  });

  it("keeps events private while a dataset's move to a public catalog is only drafted", async () => {
    const privateCatalog = await createCatalog(false);
    const publicCatalog = await createCatalog(true);
    const dataset = await createDataset(privateCatalog.id);
    const event = await createEvent(dataset.id);

    await payload.update({
      collection: "datasets",
      id: dataset.id,
      draft: true,
      data: { catalog: publicCatalog.id },
      overrideAccess: true,
    });

    expect((await payload.findByID({ collection: "events", id: event.id, overrideAccess: true })).datasetIsPublic).toBe(
      false
    );
    expect(await anonymousCanRead(event.id)).toBe(false);

    await payload.update({
      collection: "datasets",
      id: dataset.id,
      data: { _status: "published" },
      overrideAccess: true,
    });

    expect((await payload.findByID({ collection: "events", id: event.id, overrideAccess: true })).datasetIsPublic).toBe(
      true
    );
    expect(await anonymousCanRead(event.id)).toBe(true);
  });
});

// @vitest-environment node
/**
 * Integration tests for catalog/dataset visibility and ownership sync cascade.
 *
 * Tests the denormalized field propagation that keeps `datasetIsPublic`,
 * `catalogIsPublic`, and `catalogOwnerId` in sync when catalogs or datasets
 * change visibility or ownership.
 *
 * @module
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";
import {
  createIntegrationTestEnvironment,
  type TestEnvironment,
  withUsers,
} from "@/tests/setup/integration/environment";

describe.sequential("Visibility and ownership sync cascade", () => {
  let testEnv: TestEnvironment;
  let payload: TestEnvironment["payload"];
  let cleanup: () => Promise<void>;

  let adminUser: User;
  let ownerUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    cleanup = testEnv.cleanup;

    const { users } = await withUsers(testEnv, { admin: { role: "admin" }, owner: { role: "user" } });
    adminUser = users.admin;
    ownerUser = users.owner;
  }, 60000);

  afterAll(async () => {
    await cleanup();
  });

  // Helper: create catalog bypassing quota (no user → quota hook skips)
  const createCatalog = async (name: string, isPublic: boolean, createdBy: number) =>
    payload.create({ collection: "catalogs", data: { name, isPublic, createdBy }, overrideAccess: true });

  // Helper: create dataset
  const createDataset = async (catalogId: number, name: string, isPublic: boolean) =>
    payload.create({
      collection: "datasets",
      data: { name, catalog: catalogId, language: "eng", isPublic },
      overrideAccess: true,
    });

  // Helper: create an event in a dataset
  const createEvent = async (datasetId: number, suffix: string) =>
    payload.create({
      collection: "events",
      data: {
        dataset: datasetId,
        sourceData: { test: suffix },
        transformedData: { test: suffix },
        uniqueId: `${datasetId}:test:${suffix}-${Date.now()}-${Math.random()}`,
      },
      overrideAccess: true,
    });

  // Helper: create a dataset-schema in a dataset
  const createSchema = async (datasetId: number) =>
    payload.create({
      collection: "dataset-schemas",
      data: {
        dataset: datasetId,
        versionNumber: 1,
        schema: { type: "object", properties: { test: { type: "string" } } },
        fieldMetadata: { test: { type: "string" } },
      },
      overrideAccess: true,
    });

  // Helper: read event by ID with overrideAccess to see denormalized fields
  const readEvent = async (eventId: number) =>
    payload.findByID({ collection: "events", id: eventId, overrideAccess: true });

  // Helper: read schema by ID
  const readSchema = async (schemaId: number) =>
    payload.findByID({ collection: "dataset-schemas", id: schemaId, overrideAccess: true });

  // Helper: read dataset by ID
  const readDataset = async (datasetId: number) =>
    payload.findByID({ collection: "datasets", id: datasetId, overrideAccess: true });

  describe("Catalog → Dataset sync (syncDatasetsWithCatalog)", () => {
    let catalogId: number;
    let datasetId: number;

    beforeEach(async () => {
      const catalog = await createCatalog(`Cat ${Date.now()}`, true, ownerUser.id);
      catalogId = catalog.id;
      const dataset = await createDataset(catalogId, `DS ${Date.now()}`, true);
      datasetId = dataset.id;
    });

    it("propagates catalogIsPublic=false when catalog goes private", async () => {
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: false }, overrideAccess: true });

      const updated = await readDataset(datasetId);
      expect(updated.catalogIsPublic).toBe(false);
    });

    it("propagates catalogIsPublic=true when catalog goes public", async () => {
      // First make it private
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: false }, overrideAccess: true });
      // Then make it public again
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: true }, overrideAccess: true });

      const updated = await readDataset(datasetId);
      expect(updated.catalogIsPublic).toBe(true);
    });

    it("propagates catalogCreatorId when catalog ownership changes", async () => {
      await payload.update({
        collection: "catalogs",
        id: catalogId,
        data: { createdBy: adminUser.id },
        overrideAccess: true,
      });

      const updated = await readDataset(datasetId);
      expect(updated.catalogCreatorId).toBe(adminUser.id);
    });
  });

  describe("Catalog → Events/Schemas sync (batchSyncChildRecords)", () => {
    let catalogId: number;
    let publicDatasetId: number;
    let privateDatasetId: number;
    let eventInPublicId: number;
    let eventInPrivateId: number;
    let schemaInPublicId: number;
    let schemaInPrivateId: number;

    beforeEach(async () => {
      // Start with a private catalog so we can create both public and private datasets
      const catalog = await createCatalog(`Cat ${Date.now()}`, false, ownerUser.id);
      catalogId = catalog.id;

      const pubDs = await createDataset(catalogId, `Pub ${Date.now()}`, true);
      publicDatasetId = pubDs.id;

      const privDs = await createDataset(catalogId, `Priv ${Date.now()}`, false);
      privateDatasetId = privDs.id;

      const evPub = await createEvent(publicDatasetId, "pub");
      eventInPublicId = evPub.id;
      const evPriv = await createEvent(privateDatasetId, "priv");
      eventInPrivateId = evPriv.id;
      const sPub = await createSchema(publicDatasetId);
      schemaInPublicId = sPub.id;
      const sPriv = await createSchema(privateDatasetId);
      schemaInPrivateId = sPriv.id;
    });

    it("catalog goes private → all events get datasetIsPublic=false", async () => {
      // Make public first, then private to trigger the change
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: true }, overrideAccess: true });
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: false }, overrideAccess: true });

      const evPub = await readEvent(eventInPublicId);
      const evPriv = await readEvent(eventInPrivateId);
      expect(evPub.datasetIsPublic).toBe(false);
      expect(evPriv.datasetIsPublic).toBe(false);
    });

    it("catalog goes public → events reflect per-dataset visibility", async () => {
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: true }, overrideAccess: true });

      const evPub = await readEvent(eventInPublicId);
      const evPriv = await readEvent(eventInPrivateId);
      expect(evPub.datasetIsPublic).toBe(true);
      expect(evPriv.datasetIsPublic).toBe(false);
    });

    it("catalog goes public → schemas reflect per-dataset visibility", async () => {
      await payload.update({ collection: "catalogs", id: catalogId, data: { isPublic: true }, overrideAccess: true });

      const sPub = await readSchema(schemaInPublicId);
      const sPriv = await readSchema(schemaInPrivateId);
      expect(sPub.datasetIsPublic).toBe(true);
      expect(sPriv.datasetIsPublic).toBe(false);
    });

    it("ownership change propagates catalogOwnerId to events and schemas", async () => {
      await payload.update({
        collection: "catalogs",
        id: catalogId,
        data: { createdBy: adminUser.id },
        overrideAccess: true,
      });

      const evPub = await readEvent(eventInPublicId);
      const evPriv = await readEvent(eventInPrivateId);
      const sPub = await readSchema(schemaInPublicId);
      const sPriv = await readSchema(schemaInPrivateId);

      expect(evPub.catalogOwnerId).toBe(adminUser.id);
      expect(evPriv.catalogOwnerId).toBe(adminUser.id);
      expect(sPub.catalogOwnerId).toBe(adminUser.id);
      expect(sPriv.catalogOwnerId).toBe(adminUser.id);
    });
  });

  describe("Dataset → Events/Schemas sync (syncIsPublicToEvents)", () => {
    it("dataset isPublic true→false → events get datasetIsPublic=false", async () => {
      // Use private catalog so we can toggle dataset visibility freely
      const catalog = await createCatalog(`Cat ${Date.now()}`, false, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "vis-down");
      const schema = await createSchema(dataset.id);

      // Make dataset private (allowed because catalog is private)
      await payload.update({ collection: "datasets", id: dataset.id, data: { isPublic: false }, overrideAccess: true });

      const updatedEv = await readEvent(event.id);
      const updatedSch = await readSchema(schema.id);
      expect(updatedEv.datasetIsPublic).toBe(false);
      expect(updatedSch.datasetIsPublic).toBe(false);
    });

    it("dataset isPublic false→true in public catalog → events get datasetIsPublic=true", async () => {
      // Start with private catalog so we can create a private dataset
      const catalog = await createCatalog(`Cat ${Date.now()}`, false, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, false);
      const event = await createEvent(dataset.id, "vis-up-pub-cat");

      // Make catalog public first, then make dataset public
      await payload.update({ collection: "catalogs", id: catalog.id, data: { isPublic: true }, overrideAccess: true });
      await payload.update({ collection: "datasets", id: dataset.id, data: { isPublic: true }, overrideAccess: true });

      const updatedEv = await readEvent(event.id);
      expect(updatedEv.datasetIsPublic).toBe(true);
    });

    it("dataset isPublic false→true in private catalog → events stay datasetIsPublic=false", async () => {
      const catalog = await createCatalog(`Cat ${Date.now()}`, false, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, false);
      const event = await createEvent(dataset.id, "vis-up-priv-cat");

      // Make dataset public — but catalog is private, so combined is still false
      await payload.update({ collection: "datasets", id: dataset.id, data: { isPublic: true }, overrideAccess: true });

      const updatedEv = await readEvent(event.id);
      expect(updatedEv.datasetIsPublic).toBe(false);
    });

    it("no update fires when isPublic hasn't changed", async () => {
      const catalog = await createCatalog(`Cat ${Date.now()}`, true, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "no-change");

      // Update dataset name only — isPublic stays the same
      await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { name: `Renamed ${Date.now()}` },
        overrideAccess: true,
      });

      const updatedEv = await readEvent(event.id);
      expect(updatedEv.datasetIsPublic).toBe(true);
    });

    it("reparenting a dataset resyncs child visibility and ownership", async () => {
      const sourceCatalog = await createCatalog(`Source ${Date.now()}`, true, ownerUser.id);
      const targetCatalog = await createCatalog(`Target ${Date.now()}`, false, adminUser.id);
      const dataset = await createDataset(sourceCatalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "reparent");
      const schema = await createSchema(dataset.id);

      const beforeEvent = await readEvent(event.id);
      const beforeSchema = await readSchema(schema.id);
      expect(beforeEvent.datasetIsPublic).toBe(true);
      expect(beforeEvent.catalogOwnerId).toBe(ownerUser.id);
      expect(beforeSchema.datasetIsPublic).toBe(true);
      expect(beforeSchema.catalogOwnerId).toBe(ownerUser.id);

      await payload.update({
        collection: "datasets",
        id: dataset.id,
        data: { catalog: targetCatalog.id },
        overrideAccess: true,
      });

      const updatedDataset = await readDataset(dataset.id);
      const updatedEvent = await readEvent(event.id);
      const updatedSchema = await readSchema(schema.id);

      expect(updatedDataset.catalogCreatorId).toBe(adminUser.id);
      expect(updatedDataset.catalogIsPublic).toBe(false);
      expect(updatedEvent.datasetIsPublic).toBe(false);
      expect(updatedEvent.catalogOwnerId).toBe(adminUser.id);
      expect(updatedSchema.datasetIsPublic).toBe(false);
      expect(updatedSchema.catalogOwnerId).toBe(adminUser.id);
    });
  });

  describe("Access control verification (end-to-end)", () => {
    it("after catalog goes private, anonymous users cannot read its events", async () => {
      const catalog = await createCatalog(`AC Cat ${Date.now()}`, true, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "ac-priv");

      // Anonymous can read the event
      const before = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        overrideAccess: false,
      });
      expect(before.docs).toHaveLength(1);

      // Make catalog private
      await payload.update({ collection: "catalogs", id: catalog.id, data: { isPublic: false }, overrideAccess: true });

      // Anonymous can no longer read the event
      const after = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        overrideAccess: false,
      });
      expect(after.docs).toHaveLength(0);
    });

    it("after catalog goes public again, events in public datasets are accessible", async () => {
      const catalog = await createCatalog(`AC Cat2 ${Date.now()}`, false, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "ac-pub-again");

      // Anonymous cannot read — catalog is private
      const before = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        overrideAccess: false,
      });
      expect(before.docs).toHaveLength(0);

      // Make catalog public
      await payload.update({ collection: "catalogs", id: catalog.id, data: { isPublic: true }, overrideAccess: true });

      // Now anonymous can read
      const after = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        overrideAccess: false,
      });
      expect(after.docs).toHaveLength(1);
    });

    it("after ownership transfer, new owner can see events, old owner cannot (for private catalog)", async () => {
      const { users } = await withUsers(testEnv, { newOwner: { role: "user" } });
      const newOwner = users.newOwner;

      const catalog = await createCatalog(`AC Cat3 ${Date.now()}`, false, ownerUser.id);
      const dataset = await createDataset(catalog.id, `DS ${Date.now()}`, true);
      const event = await createEvent(dataset.id, "ac-transfer");

      // Owner can read
      const ownerBefore = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(ownerBefore.docs).toHaveLength(1);

      // Transfer ownership
      await payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { createdBy: newOwner.id },
        overrideAccess: true,
      });

      // New owner can read
      const newOwnerAfter = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        user: newOwner,
        overrideAccess: false,
      });
      expect(newOwnerAfter.docs).toHaveLength(1);

      // Old owner can no longer read (private catalog, not their catalog anymore)
      const oldOwnerAfter = await payload.find({
        collection: "events",
        where: { id: { equals: event.id } },
        user: ownerUser,
        overrideAccess: false,
      });
      expect(oldOwnerAfter.docs).toHaveLength(0);
    });
  });
});

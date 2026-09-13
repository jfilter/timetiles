/**
 * Integration tests for draft visibility on drafts-enabled collections.
 *
 * Each document is published and then gets an autosaved draft. Editors and
 * owners read the draft; anonymous callers and other users only ever see the
 * published state, and none of them may list version history. Rows that were
 * never published stay hidden from everyone but their owner and editors.
 *
 * @module
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";

import {
  createIntegrationTestEnvironment,
  withCatalog,
  withDataset,
  withSchemaVersion,
  withUsers,
} from "../../setup/integration/environment";

type DraftCollection =
  | "themes"
  | "layout-templates"
  | "sites"
  | "views"
  | "dataset-schemas"
  | "catalogs"
  | "datasets"
  | "events";

type DataCollection = "catalogs" | "datasets" | "events";

interface DraftCase {
  id: number;
  field: "name" | "approvalNotes" | "locationName";
  published: string;
  draft: string;
}

const DATA_COLLECTIONS: DataCollection[] = ["catalogs", "datasets", "events"];
const ALL_COLLECTIONS: DraftCollection[] = [
  "themes",
  "layout-templates",
  "sites",
  "views",
  "dataset-schemas",
  ...DATA_COLLECTIONS,
];
const OWNED_COLLECTIONS: DraftCollection[] = ["sites", "views", "dataset-schemas", ...DATA_COLLECTIONS];

/** Minimal 1x1 PNG for the media upload. */
const PNG_BUFFER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64"
);

describe.sequential("Draft read access", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let owner: User;
  let otherUser: User;
  let editor: User;
  const cases = {} as Record<DraftCollection, DraftCase>;
  const draftOnlyIds = {} as Record<DataCollection, number>;

  const publishThenDraft = async (
    collection: DraftCollection,
    id: number,
    field: DraftCase["field"] = "name"
  ): Promise<void> => {
    const published = `Published ${collection}`;
    const draft = `Unpublished draft ${collection}`;
    await payload.update({ collection, id, data: { [field]: published, _status: "published" } });
    await payload.update({ collection, id, draft: true, data: { [field]: draft } });
    cases[collection] = { id, field, published, draft };
  };

  const createEvent = async (datasetId: number, uniqueId: string, status: "draft" | "published") => {
    return payload.create({
      collection: "events",
      data: {
        uniqueId,
        dataset: datasetId,
        sourceData: {},
        transformedData: {},
        eventTimestamp: new Date(2024, 0, 1).toISOString(),
        _status: status,
      },
    });
  };

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    const { users } = await withUsers(testEnv, {
      owner: { role: "user" },
      otherUser: { role: "user" },
      editor: { role: "editor" },
    });
    owner = users.owner;
    otherUser = users.otherUser;
    editor = users.editor;
    const suffix = crypto.randomUUID().slice(0, 8);

    const theme = await payload.create({ collection: "themes", data: { name: "Theme", _status: "published" } });
    await publishThenDraft("themes", theme.id);

    const layout = await payload.create({
      collection: "layout-templates",
      data: { name: "Layout", _status: "published" },
    });
    await publishThenDraft("layout-templates", layout.id);

    const site = await payload.create({
      collection: "sites",
      data: { name: "Site", slug: `draft-site-${suffix}`, isPublic: true, _status: "published" },
      user: owner,
    });
    await publishThenDraft("sites", site.id);

    const view = await payload.create({
      collection: "views",
      data: {
        name: "View",
        slug: `draft-view-${suffix}`,
        site: site.id,
        isPublic: true,
        _status: "published",
        dataScope: { mode: "all" },
        filterConfig: { mode: "auto", maxFilters: 5 },
        mapSettings: { baseMapStyle: "default" },
      },
      user: owner,
    });
    await publishThenDraft("views", view.id);

    const { catalog } = await withCatalog(testEnv, { isPublic: true, user: owner });
    const { dataset } = await withDataset(testEnv, catalog.id, { isPublic: true });
    const { schema } = await withSchemaVersion(testEnv, dataset.id, { status: "published" });
    await publishThenDraft("dataset-schemas", schema.id, "approvalNotes");

    const event = await createEvent(dataset.id, `draft-event-${suffix}`, "published");
    await publishThenDraft("events", event.id, "locationName");
    await publishThenDraft("datasets", dataset.id);
    await publishThenDraft("catalogs", catalog.id);

    const draftCatalog = await payload.create({
      collection: "catalogs",
      data: { name: "Draft-only catalog", slug: `draft-only-catalog-${suffix}`, isPublic: true, _status: "draft" },
      user: owner,
    });
    const draftDataset = await payload.create({
      collection: "datasets",
      data: {
        name: "Draft-only dataset",
        slug: `draft-only-dataset-${suffix}`,
        catalog: catalog.id,
        language: "eng",
        isPublic: true,
        _status: "draft",
      },
    });
    const draftEvent = await createEvent(dataset.id, `draft-only-event-${suffix}`, "draft");
    draftOnlyIds.catalogs = draftCatalog.id;
    draftOnlyIds.datasets = draftDataset.id;
    draftOnlyIds.events = draftEvent.id;
  }, 120000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  const readFindByID = async (collection: DraftCollection, user: User | undefined) => {
    const { id, field } = cases[collection];
    const doc = await payload.findByID({ collection, id, draft: true, overrideAccess: false, user });
    return Reflect.get(doc, field);
  };

  const readFind = async (collection: DraftCollection, user: User | undefined) => {
    const { id, field } = cases[collection];
    const result = await payload.find({
      collection,
      where: { id: { equals: id } },
      draft: true,
      overrideAccess: false,
      user,
    });
    return result.docs.map((doc) => Reflect.get(doc, field));
  };

  const findDraftOnly = async (collection: DataCollection, user: User | undefined) => {
    const result = await payload.find({
      collection,
      where: { id: { equals: draftOnlyIds[collection] } },
      overrideAccess: false,
      user,
    });
    return result.docs.map((doc) => doc.id);
  };

  describe.each([
    ["anonymous", () => undefined],
    ["another user", () => otherUser],
  ])("%s", (_label, getUser) => {
    it.each(ALL_COLLECTIONS)("gets the published %s from findByID with draft", async (collection) => {
      expect(await readFindByID(collection, getUser())).toBe(cases[collection].published);
    });

    it.each(ALL_COLLECTIONS)("never sees the %s draft in find with draft", async (collection) => {
      expect(await readFind(collection, getUser())).not.toContain(cases[collection].draft);
    });

    it.each(ALL_COLLECTIONS)("cannot list %s versions", async (collection) => {
      await expect(payload.findVersions({ collection, overrideAccess: false, user: getUser() })).rejects.toThrow();
    });

    it.each(DATA_COLLECTIONS)("cannot find a never-published %s", async (collection) => {
      expect(await findDraftOnly(collection, getUser())).toEqual([]);
    });
  });

  describe("owner", () => {
    it.each(OWNED_COLLECTIONS)("reads the own %s draft", async (collection) => {
      expect(await readFindByID(collection, owner)).toBe(cases[collection].draft);
      expect(await readFind(collection, owner)).toEqual([cases[collection].draft]);
    });

    it.each(OWNED_COLLECTIONS)("cannot list %s versions", async (collection) => {
      await expect(payload.findVersions({ collection, overrideAccess: false, user: owner })).rejects.toThrow();
    });

    it.each(DATA_COLLECTIONS)("finds the own never-published %s", async (collection) => {
      expect(await findDraftOnly(collection, owner)).toEqual([draftOnlyIds[collection]]);
    });
  });

  describe("editor", () => {
    it.each(ALL_COLLECTIONS)("reads the %s draft", async (collection) => {
      expect(await readFindByID(collection, editor)).toBe(cases[collection].draft);
      expect(await readFind(collection, editor)).toEqual([cases[collection].draft]);
    });

    it.each(DATA_COLLECTIONS)("finds a never-published %s", async (collection) => {
      expect(await findDraftOnly(collection, editor)).toEqual([draftOnlyIds[collection]]);
    });
  });

  describe("media", () => {
    it("has no draft state, so a draft save is what anonymous readers get", async () => {
      const media = await payload.create({
        collection: "media",
        data: { alt: "Original" },
        file: {
          data: PNG_BUFFER,
          mimetype: "image/png",
          name: `draft-media-${Date.now()}.png`,
          size: PNG_BUFFER.length,
        },
        user: owner,
        overrideAccess: false,
      });
      expect(media).not.toHaveProperty("_status");

      await payload.update({
        collection: "media",
        id: media.id,
        draft: true,
        data: { alt: "Updated" },
        user: owner,
        overrideAccess: false,
      });

      const live = await payload.findByID({ collection: "media", id: media.id, overrideAccess: false });
      const withDraft = await payload.findByID({
        collection: "media",
        id: media.id,
        draft: true,
        overrideAccess: false,
      });
      expect(live.alt).toBe("Updated");
      expect(withDraft).toEqual(live);
    });
  });
});

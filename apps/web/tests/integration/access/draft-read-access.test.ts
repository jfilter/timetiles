/**
 * Integration tests for draft visibility on drafts-enabled collections.
 *
 * Each document is published and then gets an autosaved draft. Editors and
 * owners read the draft; anonymous callers and other users only ever see the
 * published state, and none of them may list version history.
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

type DraftCollection = "themes" | "layout-templates" | "sites" | "views" | "dataset-schemas";

interface DraftCase {
  id: number;
  field: "name" | "approvalNotes";
  published: string;
  draft: string;
}

const ALL_COLLECTIONS: DraftCollection[] = ["themes", "layout-templates", "sites", "views", "dataset-schemas"];
const OWNED_COLLECTIONS: DraftCollection[] = ["sites", "views", "dataset-schemas"];

describe.sequential("Draft read access", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let owner: User;
  let otherUser: User;
  let editor: User;
  const cases = {} as Record<DraftCollection, DraftCase>;

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
  });

  describe("owner", () => {
    it.each(OWNED_COLLECTIONS)("reads the own %s draft", async (collection) => {
      expect(await readFindByID(collection, owner)).toBe(cases[collection].draft);
      expect(await readFind(collection, owner)).toEqual([cases[collection].draft]);
    });

    it.each(OWNED_COLLECTIONS)("cannot list %s versions", async (collection) => {
      await expect(payload.findVersions({ collection, overrideAccess: false, user: owner })).rejects.toThrow();
    });
  });

  describe("editor", () => {
    it.each(ALL_COLLECTIONS)("reads the %s draft", async (collection) => {
      expect(await readFindByID(collection, editor)).toBe(cases[collection].draft);
      expect(await readFind(collection, editor)).toEqual([cases[collection].draft]);
    });
  });
});

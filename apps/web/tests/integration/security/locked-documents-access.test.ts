/**
 * Document locks name the editing user and block other editors, so only editors and
 * admins may read or write them.
 *
 * @module
 * @category Integration Tests
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Catalog, User } from "@/payload-types";
import { createIntegrationTestEnvironment, withUsers } from "@/tests/setup/integration/environment";

describe("payload-locked-documents access", () => {
  let env: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let users: Record<string, User>;
  let catalog: Catalog;

  beforeAll(async () => {
    env = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = env.payload;
    await env.seedManager.truncate(["payload-locked-documents"]);
    ({ users } = await withUsers(env, { regular: { role: "user" }, editor: { role: "editor" } }));
    catalog = await payload.create({ collection: "catalogs", data: { name: `Locked ${Date.now()}`, isPublic: true } });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const lockData = (user: User) => ({
    document: { relationTo: "catalogs" as const, value: catalog.id },
    user: { relationTo: "users" as const, value: user.id },
  });

  it("rejects reads and writes from a regular user", async () => {
    const regular = users.regular!;
    const editorLock = await payload.create({ collection: "payload-locked-documents", data: lockData(users.editor!) });

    await expect(
      payload.find({ collection: "payload-locked-documents", overrideAccess: false, user: regular })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.create({
        collection: "payload-locked-documents",
        data: lockData(regular),
        overrideAccess: false,
        user: regular,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      payload.delete({
        collection: "payload-locked-documents",
        id: editorLock.id,
        overrideAccess: false,
        user: regular,
      })
    ).rejects.toMatchObject({ status: 403 });

    await payload.delete({ collection: "payload-locked-documents", id: editorLock.id });
  });

  it("keeps an editor's lock when a regular user overrides it on a document they cannot update", async () => {
    const lock = await payload.create({ collection: "payload-locked-documents", data: lockData(users.editor!) });

    await expect(
      payload.update({
        collection: "catalogs",
        id: catalog.id,
        data: { name: "Taken over" },
        overrideAccess: false,
        overrideLock: true,
        user: users.regular!,
      })
    ).rejects.toMatchObject({ status: 403 });
    const remaining = await payload.find({
      collection: "payload-locked-documents",
      where: { id: { equals: lock.id } },
    });
    expect(remaining.totalDocs).toBe(1);

    await payload.delete({ collection: "payload-locked-documents", id: lock.id });
  });

  it("lets an editor take, read and release a lock", async () => {
    const editor = users.editor!;

    const lock = await payload.create({
      collection: "payload-locked-documents",
      data: lockData(editor),
      overrideAccess: false,
      user: editor,
    });
    const found = await payload.find({ collection: "payload-locked-documents", overrideAccess: false, user: editor });
    expect(found.docs.map((doc) => doc.id)).toContain(lock.id);

    await payload.delete({ collection: "payload-locked-documents", id: lock.id, overrideAccess: false, user: editor });
  });
});

/**
 * Integration tests for draft visibility on the drafts-enabled content globals.
 *
 * Footer and main menu autosave drafts; only editors and admins may read the
 * unpublished draft or the version history.
 *
 * @module
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { User } from "@/payload-types";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe.sequential("Content global drafts", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>["payload"];
  let regularUser: User;
  let editorUser: User;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    const { users } = await withUsers(testEnv, { regularUser: { role: "user" }, editorUser: { role: "editor" } });
    regularUser = users.regularUser;
    editorUser = users.editorUser;

    // `_status: "published"` is what the dashboard Publish button sends.
    await payload.updateGlobal({
      slug: "footer",
      data: { tagline: "Published tagline", copyright: "Published copyright", _status: "published" },
    });
    await payload.updateGlobal({ slug: "footer", draft: true, data: { tagline: "Unpublished draft tagline" } });

    await payload.updateGlobal({
      slug: "main-menu",
      data: { navItems: [{ label: "Published", url: "/" }], _status: "published" },
    });
    await payload.updateGlobal({
      slug: "main-menu",
      draft: true,
      data: { navItems: [{ label: "Unpublished draft", url: "/secret" }] },
    });
  }, 60000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  describe.each([
    ["anonymous", () => undefined],
    ["role user", () => regularUser],
  ])("%s", (_label, getUser) => {
    it("reads the published footer, not the draft", async () => {
      const footer = await payload.findGlobal({ slug: "footer", draft: true, overrideAccess: false, user: getUser() });
      expect(footer.tagline).toBe("Published tagline");
    });

    it("reads the published main menu, not the draft", async () => {
      const menu = await payload.findGlobal({ slug: "main-menu", draft: true, overrideAccess: false, user: getUser() });
      expect(menu.navItems?.map((item) => item.label)).toEqual(["Published"]);
    });

    it.each(["footer", "main-menu"] as const)("cannot list %s versions", async (slug) => {
      await expect(payload.findGlobalVersions({ slug, overrideAccess: false, user: getUser() })).rejects.toThrow();
    });
  });

  describe("editor", () => {
    it("reads the footer draft", async () => {
      const footer = await payload.findGlobal({ slug: "footer", draft: true, overrideAccess: false, user: editorUser });
      expect(footer.tagline).toBe("Unpublished draft tagline");
    });

    it("reads the main menu draft", async () => {
      const menu = await payload.findGlobal({
        slug: "main-menu",
        draft: true,
        overrideAccess: false,
        user: editorUser,
      });
      expect(menu.navItems?.map((item) => item.label)).toEqual(["Unpublished draft"]);
    });

    it("lists footer versions", async () => {
      const versions = await payload.findGlobalVersions({ slug: "footer", overrideAccess: false, user: editorUser });
      expect(versions.totalDocs).toBeGreaterThan(0);
    });
  });
});

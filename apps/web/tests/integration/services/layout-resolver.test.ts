/**
 * Integration tests for layout template resolution on CMS pages.
 *
 * Pages and sites are loaded the way the page routes load them, then resolved:
 * page override > site default > platform default (`null`). Templates the viewer
 * may not read — never-published drafts for anonymous visitors — are skipped.
 *
 * @module
 * @category Integration Tests
 */
import type { Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveLayoutTemplate } from "@/lib/services/resolution/layout-resolver";
import type { LayoutTemplate, Page, Site, User } from "@/payload-types";

import { createIntegrationTestEnvironment, withUsers } from "../../setup/integration/environment";

describe("resolveLayoutTemplate", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;
  let editor: User;
  let owner: User;
  let site: Site;
  let draftDefaultSite: Site;
  const pages = {} as Record<"withOverride" | "withoutOverride" | "draftOverride" | "editedOverride", number>;
  let editedTemplate: LayoutTemplate;

  const createTemplate = (data: Partial<LayoutTemplate> & { _status: "draft" | "published" }) =>
    payload.create({ collection: "layout-templates", data: { name: "Template", ...data } });

  const createSite = (slug: string, defaultLayout: number) =>
    payload.create({
      collection: "sites",
      data: { name: slug, slug, isPublic: true, defaultLayout, _status: "published" },
      user: owner,
    });

  const createPage = async (slug: string, siteId: number, layoutOverride?: number) => {
    const page = await payload.create({
      collection: "pages",
      data: {
        title: slug,
        slug,
        site: siteId,
        layoutOverride,
        pageBuilder: [{ blockType: "hero", title: slug }],
        _status: "published",
      },
    });
    return page.id;
  };

  /** Loads a page with the same query as the `[slug]` route outside Draft Mode. */
  const loadPage = async (id: number): Promise<Page> => {
    const { docs } = await payload.find({
      collection: "pages",
      where: { id: { equals: id }, _status: { equals: "published" } },
      depth: 2,
    });
    return docs[0]!;
  };

  /** Loads a site the way the site resolver does: anonymous, depth 1. */
  const loadSite = (id: number) => payload.findByID({ collection: "sites", id, depth: 1, overrideAccess: false });

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
    const { users } = await withUsers(testEnv, { editor: { role: "editor" }, owner: { role: "user" } });
    editor = users.editor;
    owner = users.owner;
    const suffix = crypto.randomUUID().slice(0, 8);

    const pageTemplate = await createTemplate({
      headerVariant: "minimal",
      footerVariant: "compact",
      _status: "published",
    });
    const siteTemplate = await createTemplate({
      headerVariant: "app",
      stickyHeader: false,
      contentMaxWidth: "sm",
      _status: "published",
    });
    const draftTemplate = await createTemplate({ headerVariant: "none", footerVariant: "none", _status: "draft" });
    editedTemplate = await createTemplate({ headerVariant: "marketing", contentMaxWidth: "xl", _status: "published" });
    await payload.update({
      collection: "layout-templates",
      id: editedTemplate.id,
      draft: true,
      data: { headerVariant: "none" },
    });

    site = await createSite(`layout-site-${suffix}`, siteTemplate.id);
    draftDefaultSite = await createSite(`layout-draft-site-${suffix}`, draftTemplate.id);

    pages.withOverride = await createPage(`with-override-${suffix}`, site.id, pageTemplate.id);
    pages.withoutOverride = await createPage(`without-override-${suffix}`, site.id);
    pages.draftOverride = await createPage(`draft-override-${suffix}`, site.id, draftTemplate.id);
    pages.editedOverride = await createPage(`edited-override-${suffix}`, site.id, editedTemplate.id);
  }, 120000);

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  const resolveAnonymous = async (pageId: number, siteDoc: Site = site) => {
    const [page, loadedSite] = await Promise.all([loadPage(pageId), loadSite(siteDoc.id)]);
    return resolveLayoutTemplate(payload, {
      pageOverride: page.layoutOverride,
      siteDefault: loadedSite.defaultLayout,
      user: null,
    });
  };

  it("prefers the page override over the site default", async () => {
    await expect(resolveAnonymous(pages.withOverride)).resolves.toEqual({
      headerVariant: "minimal",
      stickyHeader: true,
      footerVariant: "compact",
      contentMaxWidth: "lg",
    });
  });

  it("falls back to the site default without a page override", async () => {
    await expect(resolveAnonymous(pages.withoutOverride)).resolves.toEqual({
      headerVariant: "app",
      stickyHeader: false,
      footerVariant: "full",
      contentMaxWidth: "sm",
    });
  });

  it("returns null (platform default) when neither page nor site assigns a template", async () => {
    await expect(resolveLayoutTemplate(payload, { pageOverride: null, siteDefault: null, user: null })).resolves.toBe(
      null
    );
  });

  it("ignores a draft page override for anonymous visitors and uses the site default", async () => {
    await expect(resolveAnonymous(pages.draftOverride)).resolves.toMatchObject({ headerVariant: "app" });
  });

  it("ignores a draft site default for anonymous visitors", async () => {
    await expect(resolveAnonymous(pages.withoutOverride, draftDefaultSite)).resolves.toBe(null);
  });

  it("serves the published version of a template with a pending draft to anonymous visitors", async () => {
    await expect(resolveAnonymous(pages.editedOverride)).resolves.toMatchObject({
      headerVariant: "marketing",
      contentMaxWidth: "xl",
    });
  });

  it("applies draft templates in an editor's Draft Mode preview", async () => {
    const [draftPage, editedPage] = await Promise.all([loadPage(pages.draftOverride), loadPage(pages.editedOverride)]);

    await expect(
      resolveLayoutTemplate(payload, { pageOverride: draftPage.layoutOverride, user: editor, draft: true })
    ).resolves.toMatchObject({ headerVariant: "none", footerVariant: "none" });
    await expect(
      resolveLayoutTemplate(payload, { pageOverride: editedPage.layoutOverride, user: editor, draft: true })
    ).resolves.toMatchObject({ headerVariant: "none", contentMaxWidth: "xl" });
  });
});

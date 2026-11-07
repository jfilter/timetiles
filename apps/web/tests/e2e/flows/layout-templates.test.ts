/**
 * E2E tests for layout templates on CMS pages.
 *
 * An admin creates templates and pages through the REST API; an anonymous
 * visitor then sees the template's header and footer variants, a reachable
 * main landmark, and never a draft template.
 *
 * @module
 * @category E2E Tests
 */
import { AxeBuilder } from "@axe-core/playwright";
import type { APIRequestContext, Browser, Page } from "@playwright/test";

import { expect, test } from "../fixtures";

interface CreatedDoc {
  doc: { id: number };
}

const createDoc = async (request: APIRequestContext, collection: string, data: Record<string, unknown>) => {
  const response = await request.post(`/api/${collection}`, { data });
  expect(response.status(), await response.text()).toBe(201);
  return ((await response.json()) as CreatedDoc).doc.id;
};

const openAnonymous = async (browser: Browser, baseURL: string, path: string): Promise<Page> => {
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto(path);
  return page;
};

test.describe("Layout templates on CMS pages", () => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slugs = { minimal: `layout-minimal-${suffix}`, bare: `layout-bare-${suffix}`, draft: `layout-draft-${suffix}` };
  const created: { collection: string; id: number }[] = [];

  test.beforeAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: "test-results/.auth/admin.json" });
    try {
      const sites = await admin.get("/api/sites?where[isDefault][equals]=true&limit=1&depth=0");
      const siteId = ((await sites.json()) as { docs: { id: number }[] }).docs[0]!.id;

      const template = async (data: Record<string, unknown>) => {
        const id = await createDoc(admin, "layout-templates", { name: `E2E ${suffix}`, ...data });
        created.push({ collection: "layout-templates", id });
        return id;
      };
      const page = async (slug: string, layoutOverride: number) => {
        const id = await createDoc(admin, "pages", {
          title: slug,
          slug,
          site: siteId,
          layoutOverride,
          pageBuilder: [{ blockType: "hero", title: `Hero ${slug}` }],
          _status: "published",
        });
        created.push({ collection: "pages", id });
      };

      await page(
        slugs.minimal,
        await template({
          headerVariant: "minimal",
          footerVariant: "compact",
          contentMaxWidth: "sm",
          _status: "published",
        })
      );
      await page(slugs.bare, await template({ headerVariant: "none", footerVariant: "none", _status: "published" }));
      await page(slugs.draft, await template({ headerVariant: "none", footerVariant: "none", _status: "draft" }));
    } finally {
      await admin.dispose();
    }
  });

  test.afterAll(async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: "test-results/.auth/admin.json" });
    // Pages first: they reference the templates.
    for (const { collection, id } of created.toReversed()) {
      await admin.delete(`/api/${collection}/${id}`);
    }
    await admin.dispose();
  });

  test("minimal header and compact footer keep the landmarks and pass axe", async ({ browser, baseURL }) => {
    const page = await openAnonymous(browser, baseURL, `/${slugs.minimal}`);

    const banner = page.getByRole("banner");
    await expect(banner.getByRole("link", { name: "TimeTiles" })).toBeVisible();
    await expect(banner.getByRole("link")).toHaveCount(1);
    await expect(banner.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toContainText("TimeTiles");
    await expect(page.getByRole("main")).toContainText(`Hero ${slugs.minimal}`);

    // The skip link is the first tab stop and moves focus to the main landmark
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(results.violations).toEqual([]);
    await page.context().close();
  });

  test("none variants render no header or footer but keep main and the skip link", async ({ browser, baseURL }) => {
    const page = await openAnonymous(browser, baseURL, `/${slugs.bare}`);

    await expect(page.getByRole("main")).toContainText(`Hero ${slugs.bare}`);
    await expect(page.getByRole("banner")).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    await page.context().close();
  });

  test("a draft template is not applied for anonymous visitors", async ({ browser, baseURL }) => {
    const page = await openAnonymous(browser, baseURL, `/${slugs.draft}`);

    await expect(page.getByRole("main")).toContainText(`Hero ${slugs.draft}`);
    await expect(page.getByRole("banner").getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await page.context().close();
  });
});

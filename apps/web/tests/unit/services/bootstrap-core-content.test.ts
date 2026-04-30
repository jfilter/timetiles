// @vitest-environment node
/**
 * Unit tests for deployment core-content bootstrap.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { describe, expect, it, vi } from "vitest";

import { bootstrapDefaultCoreContent } from "@/lib/services/bootstrap/core-content";

describe("bootstrapDefaultCoreContent", () => {
  it("creates missing deployment CMS defaults without requiring seed presets", async () => {
    const createdPages = new Map<number, Record<string, unknown>>();
    let nextPageId = 100;

    const payload = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      findGlobal: vi.fn().mockResolvedValue({}),
      updateGlobal: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockImplementation(({ collection, data }) => {
        if (collection === "sites") return Promise.resolve({ ...data, id: 7 });
        if (collection === "views") return Promise.resolve({ ...data, id: 70 });
        if (collection === "pages") {
          const id = nextPageId++;
          createdPages.set(id, data);
          return Promise.resolve({ ...data, id });
        }
        throw new Error(`Unexpected collection: ${String(collection)}`);
      }),
      findByID: vi.fn().mockImplementation(({ id }) => {
        const page = createdPages.get(Number(id));
        const pageBuilder = Array.isArray(page?.pageBuilder)
          ? page.pageBuilder.map((block, index) => ({
              ...(block as Record<string, unknown>),
              id: `block-${id}-${index}`,
            }))
          : [];
        return Promise.resolve({ ...page, id, pageBuilder });
      }),
    };

    await bootstrapDefaultCoreContent(payload as never);

    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "sites", data: expect.objectContaining({ slug: "default" }) })
    );
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "views",
        data: expect.objectContaining({ slug: "default-default", site: 7 }),
      })
    );

    const pageCreates = payload.create.mock.calls.filter(([args]) => args.collection === "pages");
    expect(pageCreates.map(([args]) => args.data.slug)).toEqual(["home", "about", "contact", "terms", "privacy"]);
    expect(pageCreates.every(([args]) => args.data.site === 7)).toBe(true);

    const globalUpdates = payload.updateGlobal.mock.calls
      .map(([args]) => `${args.slug}:${args.locale}`)
      .sort((a, b) => a.localeCompare(b));
    expect(globalUpdates).toEqual([
      "footer:de",
      "footer:en",
      "main-menu:de",
      "main-menu:en",
      "settings:de",
      "settings:en",
    ]);
  });

  it("leaves existing non-empty deployment content untouched", async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({ docs: [{ id: 7, slug: "default", isDefault: true }] }),
      findGlobal: vi.fn().mockImplementation(({ slug }) => {
        if (slug === "footer") return Promise.resolve({ tagline: "Custom", columns: [{ title: "Custom" }] });
        if (slug === "main-menu") return Promise.resolve({ navItems: [{ label: "Custom", url: "/" }] });
        return Promise.resolve({ legal: { termsUrl: "/custom-terms" } });
      }),
      updateGlobal: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      findByID: vi.fn().mockResolvedValue({}),
    };

    await bootstrapDefaultCoreContent(payload as never);

    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.updateGlobal).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});

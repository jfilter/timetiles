/**
 * Unit tests for the slug field hook.
 *
 * @module
 * @category Unit Tests
 */
import { describe, expect, it } from "vitest";

import { createSlugHook } from "@/lib/collections/slug";

describe("createSlugHook", () => {
  const hook = createSlugHook("sites");

  it("normalizes a slug supplied on create", async () => {
    const slug = await hook({
      value: 'Evil"]</style><script>alert(1)</script>',
      data: { name: "Site" },
      operation: "create",
    });

    expect(slug).toBe("evil-style-script-alert-1-script");
  });

  it("generates from the source field when a supplied slug normalizes to nothing", async () => {
    const slug = await hook({ value: "!!!", data: { name: "My Site" }, operation: "create" });

    expect(slug).toBe("my-site");
  });

  it("keeps an already normalized slug unchanged", async () => {
    const slug = await hook({ value: "my-site", data: { name: "Other" }, operation: "create" });

    expect(slug).toBe("my-site");
  });

  it("keeps an unchanged stored slug that predates normalization", async () => {
    const slug = await hook({
      value: "Legacy_Slug",
      data: { name: "Page" },
      operation: "update",
      originalDoc: { id: 1, slug: "Legacy_Slug" },
    });

    expect(slug).toBe("Legacy_Slug");
  });

  it("normalizes a slug that changes on update", async () => {
    const slug = await hook({
      value: "New Slug",
      data: { name: "Page" },
      operation: "update",
      originalDoc: { id: 1, slug: "old-slug" },
    });

    expect(slug).toBe("new-slug");
  });
});

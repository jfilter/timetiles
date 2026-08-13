/**
 * Unit tests for the scrapers `targetDataset` ownership gate.
 *
 * `targetDataset` is a plain writable relationship and `update` access is scoped to
 * the repo owner, so without this hook a scraper owner could point their scraper at a
 * stranger's dataset — auto-import then writes the scraped rows into it as a system
 * job, which is exactly the case the events cross-dataset guard exempts.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it, vi } from "vitest";

import { validateTargetDatasetAccess } from "@/lib/collections/scrapers/hooks";

const OWNER_ID = 42;
const STRANGER_ID = 99;

type HookArgs = Parameters<typeof validateTargetDatasetAccess>[0];

/** Payload stub: dataset 7 lives in catalog 3, owned by `catalogOwner`. */
const createPayload = (catalogOwner: number, isPublic = false) => ({
  findByID: vi.fn(({ collection }: { collection: string }) =>
    collection === "datasets"
      ? Promise.resolve({ id: 7, catalog: 3 })
      : Promise.resolve({ id: 3, createdBy: catalogOwner, isPublic })
  ),
});

const runHook = (
  user: { id: number; role: string } | null,
  catalogOwner: number,
  data: Record<string, unknown> = { targetDataset: 7 },
  originalDoc?: Record<string, unknown>,
  isPublic = false
) =>
  validateTargetDatasetAccess({
    data,
    originalDoc,
    operation: "update",
    req: { user, payload: createPayload(catalogOwner, isPublic), context: {} },
  } as unknown as HookArgs);

describe.sequential("scrapers validateTargetDatasetAccess", () => {
  it("rejects a dataset in someone else's catalog", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID)).rejects.toThrow(/permission/i);
  });

  // A public catalog does NOT grant this: naming an existing dataset is a targeted
  // write, unlike contributing an import through the catalog's own flow.
  it("rejects a public catalog owned by someone else", async () => {
    await expect(
      runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID, { targetDataset: 7 }, undefined, true)
    ).rejects.toThrow(/permission/i);
  });

  it("allows a dataset in the user's own catalog", async () => {
    await expect(runHook({ id: OWNER_ID, role: "user" }, OWNER_ID)).resolves.toBeDefined();
  });

  it.each(["admin", "editor"])("allows a %s to target any dataset", async (role) => {
    await expect(runHook({ id: OWNER_ID, role }, STRANGER_ID)).resolves.toBeDefined();
  });

  it("allows a system write with no acting user", async () => {
    await expect(runHook(null, STRANGER_ID)).resolves.toBeDefined();
  });

  it("skips the lookup when targetDataset is unchanged", async () => {
    await expect(
      runHook({ id: OWNER_ID, role: "user" }, STRANGER_ID, { targetDataset: 7, name: "renamed" }, { targetDataset: 7 })
    ).resolves.toBeDefined();
  });
});

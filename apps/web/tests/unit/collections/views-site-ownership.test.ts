/**
 * Regression tests for which Site a user may attach a View to.
 *
 * Views `create` access is bare `isAuthenticated` (createPublicOwnershipAccess),
 * the required `site` relationship carries no access control of its own, and
 * `isPublic` defaults to true. The view resolver reads views anonymously with
 * `overrideAccess: false`, so an unguarded create let any authenticated user
 * plant a public View on someone else's Site and have it served from that
 * site's `/explore?view=<slug>` — controlling its data scope, filter config and
 * map style. Sites restrict `create` to editors/admins for exactly this reason.
 *
 * @module
 * @category Tests
 */
import "@/tests/mocks/services/logger";

const ownershipMocks = vi.hoisted(() => ({ safeFetchRecord: vi.fn() }));

vi.mock("@/lib/collections/catalog-ownership", async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogOwnershipModule>()),
  safeFetchRecord: ownershipMocks.safeFetchRecord,
}));

vi.mock("@/lib/services/resolution/view-resolver", () => ({ clearViewCache: vi.fn() }));

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as CatalogOwnershipModule from "@/lib/collections/catalog-ownership";
import { validateSiteOwnership } from "@/lib/collections/views/hooks";

const OWNER_ID = 42;
const OTHER_OWNER_ID = 99;
const SITE_ID = 7;

const siteOwnedBy = (ownerId: number) => ({ id: SITE_ID, createdBy: ownerId });

const runHook = (args: {
  user: { id: number; role: string } | null;
  operation?: "create" | "update";
  site?: unknown;
  originalSite?: unknown;
}) =>
  // Cast: the hook signature is narrowed by Payload generics the test does not model.
  (validateSiteOwnership as (a: unknown) => Promise<unknown>)({
    data: { name: "planted", site: args.site ?? SITE_ID },
    operation: args.operation ?? "create",
    originalDoc: args.originalSite === undefined ? undefined : { site: args.originalSite },
    req: { user: args.user, payload: {}, context: {} },
  });

// Sequential: the suite asserts call counts on a shared module mock, and this
// project runs tests concurrently within a file by default (vitest.config.ts).
describe.sequential("views beforeChange — target site ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects creating a view on a site owned by someone else", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(siteOwnedBy(OTHER_OWNER_ID));

    await expect(runHook({ user: { id: OWNER_ID, role: "user" } })).rejects.toThrow(
      "You can only create views in your own sites"
    );
  });

  it("allows creating a view on a site the caller owns", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(siteOwnedBy(OWNER_ID));

    await expect(runHook({ user: { id: OWNER_ID, role: "user" } })).resolves.toEqual(
      expect.objectContaining({ site: SITE_ID })
    );
  });

  it("rejects when the referenced site cannot be read", async () => {
    // A site we cannot resolve must fail closed rather than be silently accepted.
    ownershipMocks.safeFetchRecord.mockResolvedValue(null);

    await expect(runHook({ user: { id: OWNER_ID, role: "user" } })).rejects.toThrow(
      "You can only create views in your own sites"
    );
  });

  it("rejects moving an existing view onto someone else's site", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(siteOwnedBy(OTHER_OWNER_ID));

    await expect(
      runHook({ user: { id: OWNER_ID, role: "user" }, operation: "update", site: SITE_ID, originalSite: 1 })
    ).rejects.toThrow("You can only create views in your own sites");
  });

  it("skips the lookup when the site relationship is unchanged on update", async () => {
    await expect(
      runHook({ user: { id: OWNER_ID, role: "user" }, operation: "update", site: SITE_ID, originalSite: SITE_ID })
    ).resolves.toBeDefined();

    expect(ownershipMocks.safeFetchRecord).not.toHaveBeenCalled();
  });

  it("allows privileged users to attach a view to any site", async () => {
    ownershipMocks.safeFetchRecord.mockResolvedValue(siteOwnedBy(OTHER_OWNER_ID));

    await expect(runHook({ user: { id: OWNER_ID, role: "admin" } })).resolves.toBeDefined();
    expect(ownershipMocks.safeFetchRecord).not.toHaveBeenCalled();
  });

  it("allows system operations with no acting user (seeding, migrations)", async () => {
    await expect(runHook({ user: null })).resolves.toBeDefined();
    expect(ownershipMocks.safeFetchRecord).not.toHaveBeenCalled();
  });

  it("is registered as a beforeChange hook on the Views collection", async () => {
    // The guard is worthless if it is never wired up.
    const Views = (await import("@/lib/collections/views/index")).default;

    expect(Views.hooks?.beforeChange).toContain(validateSiteOwnership);
  });
});

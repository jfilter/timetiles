/**
 * Access control rules for the scrapers collection.
 *
 * @module
 */
import type { Access, Where } from "payload";

import { getFeatureFlagService } from "@/lib/services/feature-flag-service";

import { createOwnershipAccess, isEditorOrAdmin, isPrivileged } from "../shared-fields";

export const scrapersAccess = {
  // eslint-disable-next-line sonarjs/function-return-type -- Payload access control returns boolean | Where by design
  read: (({ req: { user } }): boolean | Where => {
    if (isPrivileged(user)) return true;
    if (!user) return false;
    return { repoCreatedBy: { equals: user.id } };
  }) as Access,
  create: (async ({ req: { user, payload } }) => {
    if (!user) return false;
    const enabled = await getFeatureFlagService(payload).isEnabled("enableScrapers");
    if (!enabled) return false;
    const trustLevel = typeof user.trustLevel === "string" ? Number(user.trustLevel) : (user.trustLevel ?? 0);
    return trustLevel >= 3 || user.role === "admin";
  }) as Access,
  update: createOwnershipAccess("scrapers", "repoCreatedBy"),
  delete: isEditorOrAdmin,
  readVersions: isEditorOrAdmin,
};

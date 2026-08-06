/**
 * Access control rules for the scrapers collection.
 *
 * @module
 */
import type { Access } from "payload";

import { getFeatureFlagService } from "@/lib/services/feature-flag-service";

import { createOwnershipAccess, isEditorOrAdmin } from "../shared-fields";

export const scrapersAccess = {
  read: createOwnershipAccess("scrapers", "repoCreatedBy"),
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

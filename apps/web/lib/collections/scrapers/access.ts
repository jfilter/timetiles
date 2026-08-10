/**
 * Access control rules for the scrapers collection.
 *
 * @module
 */
import type { Access } from "payload";

import { getFeatureFlagService } from "@/lib/services/feature-flag-service";

import { createOwnershipAccess, denyPendingDeletion, isEditorOrAdmin } from "../shared-fields";

/**
 * Create access shared by scrapers and scraper repos: no pending-deletion
 * account, the `enableScrapers` feature flag on, and trust level 3+ (or admin).
 */
export const canCreateScraperResources: Access = denyPendingDeletion(async ({ req: { user, payload } }) => {
  if (!user) return false;
  const enabled = await getFeatureFlagService(payload).isEnabled("enableScrapers");
  if (!enabled) return false;
  const trustLevel = typeof user.trustLevel === "string" ? Number(user.trustLevel) : (user.trustLevel ?? 0);
  return trustLevel >= 3 || user.role === "admin";
});

export const scrapersAccess = {
  read: createOwnershipAccess("repoCreatedBy"),
  create: canCreateScraperResources,
  update: createOwnershipAccess("repoCreatedBy"),
  delete: isEditorOrAdmin,
  readVersions: isEditorOrAdmin,
};

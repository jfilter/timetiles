/**
 * Access control rules for the scrapers collection.
 *
 * @module
 */
import type { Access } from "payload";

import { getFeatureFlagService } from "@/lib/services/feature-flag-service";

import { createOwnershipAccess, isEditorOrAdmin } from "../shared-fields";

/**
 * Create access shared by scrapers and scraper repos: the `enableScrapers`
 * feature flag must be on, and the user needs trust level 3+ (or admin).
 */
export const canCreateScraperResources: Access = async ({ req: { user, payload } }) => {
  if (!user) return false;
  const enabled = await getFeatureFlagService(payload).isEnabled("enableScrapers");
  if (!enabled) return false;
  const trustLevel = typeof user.trustLevel === "string" ? Number(user.trustLevel) : (user.trustLevel ?? 0);
  return trustLevel >= 3 || user.role === "admin";
};

export const scrapersAccess = {
  read: createOwnershipAccess("scrapers", "repoCreatedBy"),
  create: canCreateScraperResources,
  update: createOwnershipAccess("scrapers", "repoCreatedBy"),
  delete: isEditorOrAdmin,
  readVersions: isEditorOrAdmin,
};

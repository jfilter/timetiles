/**
 * Lifecycle hooks for the scrapers collection.
 *
 * @module
 */
import type { CollectionBeforeChangeHook } from "payload";

import { handleWebhookTokenLifecycle } from "@/lib/services/webhook-registry";
import { extractRelationId } from "@/lib/utils/relation-id";

import { resolveRepoOwner } from "./validation";

/**
 * beforeChange hook that server-sets repoCreatedBy and validates repo ownership.
 *
 * On create: looks up the repo, validates the user owns it, and sets repoCreatedBy.
 * On update: strips client-sent repoCreatedBy; if repo changes, re-validates and re-sets.
 */
export const validateAndSetRepoOwnership: CollectionBeforeChangeHook = async ({
  data,
  req,
  operation,
  originalDoc,
}) => {
  if (!data) return data;
  if (req.context?.seed) return data;

  // Collect all mutations before applying — avoids require-atomic-updates false positives
  let repoCreatedBy: number | undefined;
  let shouldDeleteRepoCreatedBy = false;

  if (operation === "create") {
    const repoId = extractRelationId(data.repo);
    if (repoId) {
      repoCreatedBy = await resolveRepoOwner(
        req.payload,
        repoId,
        req.user ?? undefined,
        "You can only create scrapers for your own scraper repos"
      );
    }
  }

  if (operation === "update") {
    // Prevent client-initiated updates to repoCreatedBy
    if (req.user) {
      shouldDeleteRepoCreatedBy = true;
    }
    // If repo field is changing, re-validate and re-set
    const newRepoId = data.repo !== undefined ? extractRelationId(data.repo) : undefined;
    const originalRepoId = extractRelationId(originalDoc?.repo);
    if (newRepoId && newRepoId !== originalRepoId) {
      repoCreatedBy = await resolveRepoOwner(
        req.payload,
        newRepoId,
        req.user ?? undefined,
        "You can only assign scrapers to your own scraper repos"
      );
      shouldDeleteRepoCreatedBy = false; // override: we have a new value
    }
  }

  // Build result without mutating data after awaits
  if (shouldDeleteRepoCreatedBy && repoCreatedBy === undefined) {
    const { repoCreatedBy: _stripped, ...rest } = data;
    return rest;
  }
  if (repoCreatedBy !== undefined) {
    return { ...data, repoCreatedBy };
  }
  return data;
};

/**
 * beforeChange hook that manages webhook token lifecycle.
 */
export const webhookTokenLifecycleHook: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (data) handleWebhookTokenLifecycle(data, originalDoc);
  return data;
};

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [validateAndSetRepoOwnership, webhookTokenLifecycleHook];

/**
 * Lifecycle hooks for the scrapers collection.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres/drizzle";
import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook } from "payload";

import { getTransactionAwareDrizzle } from "@/lib/database/drizzle-transaction";
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
export const webhookTokenLifecycleHook: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (data) handleWebhookTokenLifecycle(data, originalDoc, req);
  return data;
};

/**
 * beforeChange hook that clears nextRunAt when the cron schedule changes.
 *
 * shouldScraperRunNow gives nextRunAt absolute precedence, so a stale value from
 * the OLD schedule defers the new cadence until the previous fire time passes
 * (e.g. switching daily→hourly waits up to a day; a far-future value defers
 * indefinitely). The manifest-sync path (scraper-repo-sync-job) already resets
 * nextRunAt on a schedule change and scheduled-ingests does the same in its
 * collection hook — but a direct admin/REST edit of `schedule` had no equivalent
 * guard. Clearing it forces a recompute from the new schedule (the scheduler's
 * lastRunAt fallback, or "run now" on first match).
 */
export const resetNextRunOnScheduleChange: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (!data) return data;
  // A field counts as changed only when present in the incoming `data` and
  // differing from originalDoc, so a partial update that omits `schedule` is not
  // mistaken for clearing it (mirrors scheduled-ingests' scheduleDefinitionChanged).
  if (
    operation === "update" &&
    originalDoc &&
    data.schedule !== undefined &&
    (data.schedule ?? null) !== (originalDoc.schedule ?? null)
  ) {
    return { ...data, nextRunAt: null };
  }
  return data;
};

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  validateAndSetRepoOwnership,
  webhookTokenLifecycleHook,
  resetNextRunOnScheduleChange,
];

/**
 * Lock a scraper row and reject the delete if a run is still in flight.
 *
 * scraper_runs.scraper_id is NOT NULL while its foreign key says
 * ON DELETE SET NULL — a combination the database can never satisfy, which is
 * why the cascade below is emulated in application code at all.
 *
 * That emulation is not atomic on its own: Payload does not lock the parent
 * before beforeDelete, so an execution job can insert a run between the child
 * delete and the parent delete, and the parent delete then dies on the foreign
 * key with an opaque 500. Taking the row lock here closes that window, because
 * the job's own writes to this scraper serialize behind it.
 *
 * Refusing outright is the honest answer rather than deleting anyway: a run in
 * flight owns a container on the runner and an in-progress auto-import, and
 * neither is reliably cancellable from here.
 */
const assertScraperNotRunning = async (
  req: Parameters<CollectionBeforeDeleteHook>[0]["req"],
  id: number | string
): Promise<void> => {
  const db = await getTransactionAwareDrizzle(req.payload, req);
  const locked = await db.execute(
    sql`SELECT last_run_status FROM payload.scrapers WHERE id = ${Number(id)} FOR UPDATE`
  );
  const rows = (locked as unknown as { rows?: { last_run_status?: string | null }[] }).rows ?? [];

  // No row means it is already gone; let Payload produce its own not-found.
  if (rows[0]?.last_run_status === "running") {
    // APIError, not the app's ConflictError: the generic Payload REST handler
    // only maps Payload errors to their status code.
    throw new APIError("Scraper is currently running", 409);
  }
};

/**
 * beforeDelete hook that refuses to delete a running scraper, then removes the
 * scraper's runs.
 *
 * Cascading here keeps every delete path (admin UI, REST, repo cascade,
 * account deletion) consistent with what the repo-sync job already does
 * manually.
 */
export const deleteScraperRunsBeforeDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  await assertScraperNotRunning(req, id);

  await req.payload.delete({
    collection: "scraper-runs",
    where: { scraper: { equals: id } },
    overrideAccess: true,
    req,
  });
};

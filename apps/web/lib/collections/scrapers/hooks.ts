/**
 * Lifecycle hooks for the scrapers collection.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres/drizzle";
import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook } from "payload";

import { validateDatasetCatalogOwnership } from "@/lib/collections/catalog-ownership";
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
  let repoCreatedBy: number | null | undefined;
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

  // Build result without mutating data after awaits. `null` is a real value here
  // (an ownerless repo) and must survive the undefined check below.
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

/**
 * Validates that a scraper's `targetDataset` belongs to a catalog the user owns.
 *
 * `targetDataset` is a plain writable relationship and `update` access is scoped to the
 * repo owner, so without this a scraper owner could point their own scraper at a
 * stranger's dataset: auto-import then writes the scraped rows into it as a SYSTEM job,
 * which is exactly the case the events hook's cross-dataset guard exempts. The policy
 * itself lives in `validateDatasetCatalogOwnership`, shared with scheduled-ingests.
 */
// eslint-disable-next-line sonarjs/no-invariant-returns -- Payload hook pattern requires returning data
export const validateTargetDatasetAccess: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  if (!data) return data;
  if (req.context?.seed) return data;
  if (!req.user) return data;

  const targetDatasetId = extractRelationId<number>(data.targetDataset as number | { id: number } | null | undefined);
  if (targetDatasetId == null) return data;

  // Unchanged value on a partial update needs no re-check.
  const previousId = extractRelationId<number>(
    originalDoc?.targetDataset as number | { id: number } | null | undefined
  );
  if (previousId === targetDatasetId) return data;

  await validateDatasetCatalogOwnership(req, [targetDatasetId], req.user);

  return data;
};

export const beforeChangeHooks: CollectionBeforeChangeHook[] = [
  validateAndSetRepoOwnership,
  validateTargetDatasetAccess,
  webhookTokenLifecycleHook,
  resetNextRunOnScheduleChange,
];

/**
 * How long a "running" claim stays authoritative.
 *
 * Matches the default threshold of cleanup-stuck-scrapers-job, which is the job
 * that clears these claims: past this age the reaper itself would call the run
 * stuck and reset it, so continuing to honour the claim here only blocks
 * deletes on a run the system has already given up on.
 */
const RUNNING_CLAIM_STALE_AFTER_MS = 4 * 60 * 60 * 1000;

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
 * Refusing outright is the honest answer for a run that really is in flight: it
 * owns a container on the runner and an in-progress auto-import, and neither is
 * reliably cancellable from here.
 *
 * But the refusal is bounded by age, because an UNBOUNDED one is a trap. A
 * worker killed mid-scrape leaves `last_run_status = 'running'` with nothing to
 * clear it, and scraper-repos' beforeDelete re-raises this 409 at repo level —
 * which account deletion (deletion-service) cascades through inside a single
 * transaction. One wedged scraper therefore aborted and rolled back a user's
 * entire account deletion, permanently. A claim older than the reaper's own
 * threshold is treated as abandoned and the delete proceeds.
 *
 * The bound only applies when staleness can be PROVEN. A NULL last_run_at keeps
 * blocking: it means the claim's age is unknown, not that it is old, and
 * guessing "old" there would delete a scraper whose run is genuinely live.
 * Account deletion does not depend on this bound anyway — deletion-service
 * clears the user's running claims outright before cascading, so it stays
 * unblocked even for rows predating the claim-time timestamp.
 */
const assertScraperNotRunning = async (
  req: Parameters<CollectionBeforeDeleteHook>[0]["req"],
  id: number | string
): Promise<void> => {
  const db = await getTransactionAwareDrizzle(req.payload, req);
  const locked = await db.execute(
    sql`SELECT last_run_status, last_run_at FROM payload.scrapers WHERE id = ${Number(id)} FOR UPDATE`
  );
  const rows =
    (locked as unknown as { rows?: { last_run_status?: string | null; last_run_at?: string | Date | null }[] }).rows ??
    [];

  // No row means it is already gone; let Payload produce its own not-found.
  if (rows[0]?.last_run_status !== "running") return;

  const lastRunAt = rows[0]?.last_run_at;
  const claimedAt = lastRunAt ? new Date(lastRunAt).getTime() : Number.NaN;
  const isProvablyStale = Number.isFinite(claimedAt) && Date.now() - claimedAt > RUNNING_CLAIM_STALE_AFTER_MS;

  if (isProvablyStale) {
    req.payload.logger.warn(
      { scraperId: id, lastRunAt },
      "Deleting scraper with a stale 'running' claim; no live run could be confirmed"
    );
    return;
  }

  // APIError, not the app's ConflictError: the generic Payload REST handler
  // only maps Payload errors to their status code.
  throw new APIError("Scraper is currently running", 409);
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

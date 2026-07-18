/**
 * Read helpers for the `payload-jobs` collection.
 *
 * Lives in the infrastructure layer so both jobs (Layer 3) and domain code such
 * as collection hooks (Layer 2) can share the same active/pending-job checks
 * without a layer-boundary violation.
 *
 * @module
 * @category Services
 */
import type { Payload, Where } from "payload";

import { logError } from "@/lib/logger";
import { asSystem } from "@/lib/services/system-payload";

/**
 * Match a job-input id field against either its numeric or string form.
 *
 * Payload stores task input verbatim, so a numeric id (`scraperId: scraper.id`)
 * lands in the JSON as a number while a stringified id lands as text. A
 * string-only `equals` therefore silently matches nothing for numeric inputs
 * (defeating the check entirely). Emit an `or` covering both representations.
 */
export const buildResourceIdMatch = (resourceFieldPath: string, resourceId: string | number): Where => {
  const numericId = typeof resourceId === "number" ? resourceId : Number(resourceId);
  const matches: Where[] = [{ [resourceFieldPath]: { equals: String(resourceId) } }];
  if (Number.isFinite(numericId)) matches.push({ [resourceFieldPath]: { equals: numericId } });
  return { or: matches };
};

/**
 * Check if a Payload job is actively running for the given resource.
 *
 * Queries the `payload-jobs` collection for jobs whose input references the resource
 * and whose processing status indicates they are currently being worked on.
 * This provides a secondary safety check before resetting a "stuck" resource.
 *
 * @param payload - Payload instance
 * @param resourceFieldPath - The dot-path in job input that references the resource (e.g., "input.scheduledIngestId")
 * @param resourceId - The resource ID to match
 * @returns true if an active Payload job exists for this resource
 */
export const hasActivePayloadJob = async (
  payload: Payload,
  resourceFieldPath: string,
  resourceId: string | number
): Promise<boolean> => {
  try {
    const activeJobs = await asSystem(payload).find({
      collection: "payload-jobs" as const,
      where: {
        and: [
          buildResourceIdMatch(resourceFieldPath, resourceId),
          { processing: { equals: true } },
          { hasError: { equals: false } },
          { completedAt: { exists: false } },
        ],
      },
      limit: 1,
      pagination: false,
    });
    return activeJobs.docs.length > 0;
  } catch (error) {
    // This check gates destructive cleanup. If it fails, leave the resource
    // alone so a transient query/schema issue cannot cancel active work.
    logError(error, "Failed to check active Payload job; treating resource as active", {
      resourceFieldPath,
      resourceId: String(resourceId),
    });
    return true;
  }
};

/**
 * Check whether a queued OR in-flight Payload job already exists for a resource.
 *
 * Unlike {@link hasActivePayloadJob} (which only matches jobs actively being
 * *processed*), this also matches jobs still waiting in the queue — the right
 * predicate for DEDUP: "is a job for this resource already pending, so I must
 * not enqueue a duplicate?". Matches jobs that have neither completed nor
 * (currently) errored, optionally scoped to a specific task slug.
 *
 * Fails OPEN (returns `false`) on query error: unlike the cleanup gate above,
 * a transient failure here should not silently suppress a legitimate enqueue —
 * a rare duplicate is harmless (per-resource `concurrency` still serializes
 * execution), whereas a suppressed job would leave work undone.
 */
export const hasPendingPayloadJob = async (
  payload: Payload,
  resourceFieldPath: string,
  resourceId: string | number,
  taskSlug?: string
): Promise<boolean> => {
  try {
    const conditions: Where[] = [
      buildResourceIdMatch(resourceFieldPath, resourceId),
      { completedAt: { exists: false } },
      // A never-run queued job may leave `hasError` unset, so match anything not
      // explicitly errored — `equals: false` could miss pending jobs.
      { hasError: { not_equals: true } },
    ];
    if (taskSlug) conditions.push({ taskSlug: { equals: taskSlug } });

    const jobs = await asSystem(payload).find({
      collection: "payload-jobs" as const,
      where: { and: conditions },
      limit: 1,
      pagination: false,
    });
    return jobs.docs.length > 0;
  } catch (error) {
    logError(error, "Failed to check pending Payload job; allowing enqueue", {
      resourceFieldPath,
      resourceId: String(resourceId),
    });
    return false;
  }
};

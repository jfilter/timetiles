/**
 * Generic webhook registry for token-based triggers.
 *
 * Abstracts webhook token lookup across multiple collections (scheduled-ingests,
 * scrapers) and dispatches to the appropriate job handler. Used by the
 * POST /api/webhooks/trigger/[token] endpoint.
 *
 * @module
 * @category Services
 */
import { randomBytes } from "node:crypto";

import { and, eq, isNull, ne, or } from "@payloadcms/db-postgres/drizzle";
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { getBaseUrl } from "@/lib/utils/base-url";
import { scheduled_ingests, scrapers } from "@/payload-generated-schema";
import type { ScheduledIngest, Scraper } from "@/payload-types";

const logger = createLogger("webhook-registry");

/**
 * Result of resolving a webhook token to a triggerable resource.
 *
 * Discriminated union keyed on `type` so callers get a narrowed `record`
 * type after checking `target.type`.
 */
export type WebhookTarget =
  | { type: "scheduled-ingest"; id: number; name: string; record: ScheduledIngest }
  | { type: "scraper"; id: number; name: string; record: Scraper };

/**
 * Generate a cryptographically random webhook token.
 * 32 bytes = 64 hex characters.
 */
export const generateWebhookToken = (): string => randomBytes(32).toString("hex");

/**
 * Handle webhook token generation/rotation for a document.
 *
 * Reusable across any collection with `webhookEnabled` and `webhookToken` fields.
 * Call from a collection's `beforeChange` hook.
 */
export const handleWebhookTokenLifecycle = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>
): void => {
  if (data.webhookEnabled && !data.webhookToken) {
    data.webhookToken = generateWebhookToken();
  } else if (data.webhookEnabled && !originalDoc?.webhookEnabled) {
    // Re-enabling: rotate token for security
    data.webhookToken = generateWebhookToken();
  } else if (data.webhookEnabled === false && originalDoc?.webhookEnabled) {
    data.webhookToken = null;
  }
};

/**
 * Compute the webhook URL for display in the admin UI.
 *
 * Reusable across any collection with webhook fields.
 */
export const computeWebhookUrl = (data: Record<string, unknown> | undefined): string | null => {
  const token = data?.webhookToken;
  if (data?.webhookEnabled && typeof token === "string") {
    const baseUrl = getBaseUrl();
    return `${baseUrl}/api/webhooks/trigger/${token}`;
  }
  return null;
};

/**
 * Resolve a webhook token to its target resource.
 *
 * Checks scheduled-ingests first, then scrapers. Returns null if the token
 * is not found or the webhook is disabled on the matching record.
 */
export const resolveWebhookToken = async (payload: Payload, token: string): Promise<WebhookTarget | null> => {
  // Check scheduled-ingests
  const scheduledIngests = await payload.find({
    collection: "scheduled-ingests",
    where: { webhookToken: { equals: token } },
    limit: 1,
    overrideAccess: true,
  });

  const siDoc = scheduledIngests.docs[0];
  if (siDoc) {
    if (!siDoc.webhookEnabled) {
      logger.warn({ id: siDoc.id }, "Webhook disabled on scheduled ingest");
      return null;
    }
    return {
      type: "scheduled-ingest",
      id: siDoc.id,
      name: siDoc.name ?? `scheduled-ingest-${siDoc.id}`,
      record: siDoc,
    };
  }

  // Check scrapers
  const scrapers = await payload.find({
    collection: "scrapers",
    where: { webhookToken: { equals: token } },
    limit: 1,
    overrideAccess: true,
  });

  const scraperDoc = scrapers.docs[0];
  if (scraperDoc) {
    if (!scraperDoc.webhookEnabled) {
      logger.warn({ id: scraperDoc.id }, "Webhook disabled on scraper");
      return null;
    }
    return {
      type: "scraper",
      id: scraperDoc.id,
      name: scraperDoc.name ?? `scraper-${scraperDoc.id}`,
      record: scraperDoc,
    };
  }

  return null;
};

/**
 * Atomically claim "running" status on a scraper to prevent concurrent triggers.
 * Returns true if the claim succeeded, false if already running.
 *
 * Uses a single SQL UPDATE with a WHERE guard so that PostgreSQL row-level
 * locking prevents two concurrent callers from both succeeding.
 */
export const claimScraperRunning = async (payload: Payload, scraperId: number): Promise<boolean> => {
  const result = await payload.db.drizzle
    .update(scrapers)
    .set({ lastRunStatus: "running" })
    .where(and(eq(scrapers.id, scraperId), or(isNull(scrapers.lastRunStatus), ne(scrapers.lastRunStatus, "running"))))
    .returning({ id: scrapers.id });

  return result.length > 0;
};

/**
 * Atomically claim "running" status on a scheduled ingest to prevent concurrent triggers.
 * Returns true if the claim succeeded, false if already running.
 *
 * Uses a single SQL UPDATE with a WHERE guard so that PostgreSQL row-level
 * locking prevents two concurrent callers from both succeeding.
 *
 * Only sets `last_status` to "running". Callers that need to set additional
 * fields (last_run, current_retries, next_run) atomically should use the
 * dedicated SQL in {@link triggerScheduledIngest} instead.
 */
export const claimScheduledIngestRunning = async (payload: Payload, scheduledIngestId: number): Promise<boolean> => {
  const result = await payload.db.drizzle
    .update(scheduled_ingests)
    .set({ lastStatus: "running" })
    .where(
      and(
        eq(scheduled_ingests.id, scheduledIngestId),
        or(isNull(scheduled_ingests.lastStatus), ne(scheduled_ingests.lastStatus, "running"))
      )
    )
    .returning({ id: scheduled_ingests.id });

  return result.length > 0;
};

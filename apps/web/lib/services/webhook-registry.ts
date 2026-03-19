/**
 * Generic webhook registry for token-based triggers.
 *
 * Abstracts webhook token lookup across multiple collections (scheduled-imports,
 * scrapers) and dispatches to the appropriate job handler. Used by the
 * POST /api/webhooks/trigger/[token] endpoint.
 *
 * @module
 * @category Services
 */
import { randomBytes } from "node:crypto";

import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { createLogger } from "@/lib/logger";
import { getBaseUrl } from "@/lib/utils/base-url";

const logger = createLogger("webhook-registry");

/**
 * Result of resolving a webhook token to a triggerable resource.
 */
export interface WebhookTarget {
  /** Which collection the token belongs to. */
  type: "scheduled-import" | "scraper";
  /** The record ID in the source collection. */
  id: number;
  /** Display name for logging. */
  name: string;
  /** The full record (for dispatching). */
  record: Record<string, unknown>;
}

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
 * Checks scheduled-imports first, then scrapers. Returns null if the token
 * is not found or the webhook is disabled on the matching record.
 */
export const resolveWebhookToken = async (payload: Payload, token: string): Promise<WebhookTarget | null> => {
  // Check scheduled-imports
  const scheduledImports = await payload.find({
    collection: "scheduled-imports",
    where: { webhookToken: { equals: token } },
    limit: 1,
    overrideAccess: true,
  });

  const siDoc = scheduledImports.docs[0];
  if (siDoc) {
    if (!siDoc.webhookEnabled) {
      logger.warn({ id: siDoc.id }, "Webhook disabled on scheduled import");
      return null;
    }
    return {
      type: "scheduled-import",
      id: siDoc.id,
      name: siDoc.name ?? `scheduled-import-${siDoc.id}`,
      record: siDoc as unknown as Record<string, unknown>,
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
      record: scraperDoc as unknown as Record<string, unknown>,
    };
  }

  return null;
};

/**
 * Atomically claim "running" status on a scraper to prevent concurrent webhook triggers.
 * Returns true if the claim succeeded, false if already running.
 */
export const claimScraperRunning = async (payload: Payload, scraperId: number): Promise<boolean> => {
  const result = (await payload.db.drizzle.execute(sql`
    UPDATE payload.scrapers
    SET last_run_status = 'running'
    WHERE id = ${scraperId}
      AND (last_run_status IS NULL OR last_run_status != 'running')
    RETURNING id
  `)) as { rows: Array<{ id: number }> };

  return result.rows.length > 0;
};

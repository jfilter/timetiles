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
import { hashOpaqueValue } from "@/lib/security/hash";
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
 * 32 bytes = 64 hex characters — the plaintext the client sends when triggering.
 */
export const generateWebhookToken = (): string => randomBytes(32).toString("hex");

/**
 * Hash a plaintext webhook token for storage.
 *
 * We store only the hash in the DB so a database leak does not expose every
 * active webhook credential. The plaintext is surfaced to the admin UI
 * exactly once (via `webhookTokenPlaintext`) at creation/rotation and never
 * again — admins must copy the URL when it's first shown or rotate to reveal.
 */
export const hashWebhookToken = (plaintext: string): string => hashOpaqueValue(plaintext);

/** Request context key under which the freshly-generated plaintext is stashed. */
const PLAINTEXT_CTX_KEY = "__webhookTokenPlaintext";

interface ReqLike {
  context?: Record<string, unknown>;
}

/**
 * Handle webhook token generation/rotation for a document.
 *
 * Reusable across any collection with `webhookEnabled` and `webhookToken`
 * fields. Call from a collection's `beforeChange` hook.
 *
 * On generation we store the SHA-256 hash in `webhookToken` (persisted) and
 * stash the plaintext on `req.context` so the `afterRead` hook attached to
 * the virtual `webhookTokenPlaintext` field can surface it in the create /
 * rotate response. Later reads do not have the context, so plaintext becomes
 * `null` — exactly the "show once" behavior we want.
 */
export const handleWebhookTokenLifecycle = (
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  req?: ReqLike
): void => {
  // Re-enabling after a previous disable → rotate for security.
  const reEnabling = Boolean(data.webhookEnabled) && !originalDoc?.webhookEnabled;
  // First enable (no stored token yet).
  const firstEnable = Boolean(data.webhookEnabled) && data.webhookToken == null;
  const needsNewToken = firstEnable || reEnabling;

  if (needsNewToken) {
    const plaintext = generateWebhookToken();
    data.webhookToken = hashWebhookToken(plaintext);
    // Stash plaintext transiently on the request context so afterRead can
    // return it in the response. Not persisted.
    if (req) {
      req.context = { ...req.context, [PLAINTEXT_CTX_KEY]: plaintext };
    }
    return;
  }

  if (data.webhookEnabled === false && originalDoc?.webhookEnabled) {
    data.webhookToken = null;
  }
};

/**
 * `afterRead` hook for the virtual `webhookTokenPlaintext` field.
 *
 * Returns the freshly-generated plaintext when it sits on `req.context`
 * (the hop between `beforeChange` and the create/rotate response), else
 * `null`. This is how the admin UI learns the URL exactly once.
 */
export const readWebhookTokenPlaintext = (req: ReqLike | undefined): string | null => {
  const v = req?.context?.[PLAINTEXT_CTX_KEY];
  return typeof v === "string" && v !== "" ? v : null;
};

/**
 * Compute the webhook URL for display in the admin UI.
 *
 * Only returns a URL when the plaintext is transiently available (right
 * after create/rotate). Once the admin navigates away the stored value is
 * just a hash, so the URL field reads as null — forcing the admin to copy
 * at creation time or rotate to regenerate.
 */
export const computeWebhookUrl = (data: Record<string, unknown> | undefined): string | null => {
  const plaintext = data?.webhookTokenPlaintext;
  if (data?.webhookEnabled && typeof plaintext === "string" && plaintext !== "") {
    const baseUrl = getBaseUrl();
    return `${baseUrl}/api/webhooks/trigger/${plaintext}`;
  }
  return null;
};

/**
 * Resolve a webhook token to its target resource.
 *
 * The caller supplies the plaintext token (from the URL path). We hash it
 * before querying so timing attacks against the stored column cannot leak a
 * prefix. Returns null if the token is not found or the webhook is disabled
 * on the matching record.
 */
export const resolveWebhookToken = async (payload: Payload, token: string): Promise<WebhookTarget | null> => {
  const hashed = hashWebhookToken(token);

  // Check scheduled-ingests
  const scheduledIngests = await payload.find({
    collection: "scheduled-ingests",
    where: { webhookToken: { equals: hashed } },
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
    where: { webhookToken: { equals: hashed } },
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

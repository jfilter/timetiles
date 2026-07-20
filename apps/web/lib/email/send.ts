/**
 * Email sending utilities.
 *
 * Queues app-managed transactional emails onto Payload jobs so callers do not
 * need to repeat try/catch + logError for non-blocking notification emails.
 *
 * @module
 * @category Email
 */
import type { Payload } from "payload";

import { createLogger, logError } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";

const logger = createLogger("email");

export const EMAIL_TASK_SLUG = "send-email" as const;
export const EMAIL_JOB_QUEUE = "default" as const;
export const EMAIL_JOB_CONCURRENCY_KEY = "email-send" as const;

export const EMAIL_CONTEXTS = {
  ACCOUNT_VERIFICATION: "account-verification-email",
  ACCOUNT_EXISTS: "account-exists-email",
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- stable context slug, not a credential
  PASSWORD_RESET: "password-reset-email",
  EMAIL_CHANGE_VERIFICATION: "email-change-verification-email",
  EMAIL_CHANGE_OLD_ADDRESS: "email-change-old-address-email",
  DELETION_SCHEDULED: "deletion-scheduled-email",
  DELETION_CANCELLED: "deletion-cancelled-email",
  DELETION_COMPLETED: "deletion-completed-email",
  EXPORT_READY: "export-ready-email",
  EXPORT_FAILED: "export-failed-email",
  SCHEDULED_INGEST_CONFIG_INVALID: "scheduled-ingest-config-invalid",
  SCHEDULED_INGEST_RETRIES_EXHAUSTED: "scheduled-ingest-retries-exhausted",
} as const;

export type EmailContext = (typeof EMAIL_CONTEXTS)[keyof typeof EMAIL_CONTEXTS];

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailJobInput extends SendEmailOptions {
  context: EmailContext;
}

export interface SendEmailJobMeta {
  [key: string]: unknown;
  channel: "email";
  context: EmailContext;
  maskedTo: string;
}

export const buildSendEmailJobMeta = (to: string, context: EmailContext): SendEmailJobMeta => ({
  channel: "email",
  context,
  maskedTo: maskEmail(to),
});

/**
 * Outcome of an enqueue attempt.
 *
 * A failure here means no job row exists, so there is nothing to retry and the
 * mail will never be sent — callers that promised the user an email must be
 * able to tell that apart from success.
 */
export type QueueEmailResult = { queued: true; jobId: string | number } | { queued: false; error: unknown };

/**
 * Queue an email via Payload jobs. Never throws: the queue error is logged and
 * returned as `{ queued: false }`.
 *
 * Fire-and-forget is fine for advisory notifications ("your email was
 * changed"), where a lost message is an annoyance. It is not fine when the
 * email *is* the flow: ACCOUNT_VERIFICATION (register), PASSWORD_RESET
 * (forgot-password) and EMAIL_CHANGE_VERIFICATION (change-email) all leave the
 * user stranded — told to check an inbox that will never receive anything, with
 * no job queued to retry. Those callers should inspect the result and surface
 * the failure rather than returning success.
 */
export const queueEmail = async (
  payload: Payload,
  options: SendEmailOptions,
  context: EmailContext
): Promise<QueueEmailResult> => {
  const meta = buildSendEmailJobMeta(options.to, context);
  const jobToQueue = {
    task: EMAIL_TASK_SLUG,
    queue: EMAIL_JOB_QUEUE,
    input: { ...options, context },
    meta,
  } as Parameters<Payload["jobs"]["queue"]>[0];

  try {
    const job = await payload.jobs.queue(jobToQueue);

    logger.info({ ...meta, jobId: job.id }, "Email queued");
    return { queued: true, jobId: job.id };
  } catch (error) {
    logError(error, context, meta);
    return { queued: false, error };
  }
};

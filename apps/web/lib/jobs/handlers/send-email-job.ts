/**
 * Background job for delivering transactional emails with retry handling.
 *
 * Queues app-managed emails onto the Payload jobs system so delivery failures
 * are visible in `payload-jobs` and transient transport errors can be retried
 * without blocking the user-facing action that triggered the notification.
 *
 * @module
 * @category Jobs
 */

import { JobCancelledError } from "payload";

import { EMAIL_JOB_CONCURRENCY_KEY, EMAIL_TASK_SLUG, type SendEmailJobInput } from "@/lib/email/send";
import type { JobHandlerContext } from "@/lib/jobs/utils/job-context";
import { createLogger, logError } from "@/lib/logger";
import { maskEmail } from "@/lib/security/masking";

const logger = createLogger("email");

const EMAIL_RETRY_DELAY_MS = process.env.NODE_ENV === "test" ? 100 : 60_000;

const TERMINAL_ERROR_CODES = new Set(["EAUTH", "EENVELOPE", "EADDRPARSE", "EMESSAGE"]);
const RETRIABLE_ERROR_CODES = new Set([
  "ECONNECTION",
  "ESOCKET",
  "ETIMEDOUT",
  "ETLS",
  "EPROTOCOL",
  "EDNS",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
]);

type EmailDeliveryError = Error & { code?: string; responseCode?: number };

const getEmailErrorDetails = (error: unknown): EmailDeliveryError => {
  if (error instanceof Error) {
    return error as EmailDeliveryError;
  }

  return new Error(String(error)) as EmailDeliveryError;
};

const classifyEmailError = (error: unknown): "terminal" | "retriable" => {
  const details = getEmailErrorDetails(error);

  if (typeof details.responseCode === "number") {
    if (details.responseCode >= 500) {
      return "terminal";
    }

    if (details.responseCode >= 400) {
      return "retriable";
    }
  }

  if (details.code) {
    if (TERMINAL_ERROR_CODES.has(details.code)) {
      return "terminal";
    }

    if (RETRIABLE_ERROR_CODES.has(details.code) || details.code.startsWith("EAI_")) {
      return "retriable";
    }
  }

  // Neither responseCode nor a recognised transport code is present. This is
  // almost always a programming bug (e.g. template rendering) rather than a
  // transient delivery problem, so cancel instead of burning 3 retry attempts.
  return "terminal";
};

const getJobInput = (context: JobHandlerContext<SendEmailJobInput>): SendEmailJobInput => {
  const input = (context.input ?? context.job?.input) as SendEmailJobInput | undefined;

  if (!input?.to || !input.subject || !input.html || !input.context) {
    throw new JobCancelledError("Email job input must include to, subject, html, and context");
  }

  return input;
};

export const sendEmailJob = {
  slug: EMAIL_TASK_SLUG,
  concurrency: () => EMAIL_JOB_CONCURRENCY_KEY,
  retries: { attempts: 3, backoff: { delay: EMAIL_RETRY_DELAY_MS, type: "exponential" as const } },
  handler: async (context: JobHandlerContext<SendEmailJobInput>) => {
    const input = getJobInput(context);
    const { payload } = context.req;
    const maskedTo = maskEmail(input.to);

    try {
      await payload.sendEmail({ to: input.to, subject: input.subject, html: input.html });

      logger.info({ context: input.context, maskedTo, jobId: context.job?.id }, "Email sent");

      return { output: { success: true, context: input.context } };
    } catch (error) {
      const classification = classifyEmailError(error);

      logError(error, input.context, { classification, jobId: context.job?.id, maskedTo });

      if (classification === "terminal") {
        throw new JobCancelledError(getEmailErrorDetails(error).message);
      }

      throw error;
    }
  },
};

export { EMAIL_RETRY_DELAY_MS };

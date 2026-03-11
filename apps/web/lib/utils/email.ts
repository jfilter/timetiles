/**
 * Email sending utilities.
 *
 * Wraps Payload's `sendEmail` with error handling so callers do not need
 * to repeat try/catch + logError for fire-and-forget notification emails.
 *
 * @module
 * @category Utils
 */
import type { Payload } from "payload";

import { logError } from "@/lib/logger";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email via Payload, logging and swallowing any error.
 *
 * Use this for non-critical notifications where a delivery failure should
 * not abort the calling operation (e.g. "email changed" notifications).
 */
export const safeSendEmail = async (payload: Payload, options: SendEmailOptions, context: string): Promise<void> => {
  try {
    await payload.sendEmail(options);
  } catch (error) {
    logError(error, context);
  }
};

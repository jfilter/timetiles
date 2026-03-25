/**
 * Shared newsletter subscription utility.
 *
 * @module
 * @category Blocks
 */
import type { NewsletterMessages } from "@timetiles/ui";

import { fetchJson } from "@/lib/api/http-error";

/** Default newsletter messages — used by block renderer and footer until i18n keys are added. */
export const NEWSLETTER_MESSAGES: NewsletterMessages = {
  success: "Successfully subscribed!",
  error: "Subscription failed. Please try again.",
  networkError: "Network error. Please try again.",
};

/**
 * Submit a newsletter subscription request.
 *
 * @param email - Subscriber email address
 * @param additionalData - Optional extra fields to send with the subscription
 */
export const submitNewsletterSubscription = async (
  email: string,
  additionalData?: Record<string, unknown>
): Promise<void> => {
  await fetchJson<void>("/api/newsletter/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...additionalData }),
  });
};

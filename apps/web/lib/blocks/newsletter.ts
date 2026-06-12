/**
 * Shared newsletter subscription utility.
 *
 * @module
 * @category Blocks
 */
import { fetchJson } from "@/lib/api/http-error";

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

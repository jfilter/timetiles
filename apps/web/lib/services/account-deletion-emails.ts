/**
 * Email templates and sending functions for account deletion.
 *
 * Provides HTML email templates for:
 * - Deletion scheduled notification
 * - Deletion cancelled notification
 * - Deletion completed notification
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { callout, emailButton, emailLayout, greeting } from "@/lib/email/layout";
import { formatLongDate } from "@/lib/utils/date";
import { safeSendEmail } from "@/lib/utils/email";

/**
 * Send deletion scheduled email.
 */
export const sendDeletionScheduledEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  deletionScheduledAt: string,
  cancelUrl: string
): Promise<void> => {
  const formattedDate = formatLongDate(deletionScheduledAt);

  const html = emailLayout(`
    <h1 style="color: #dc2626;">Account Deletion Scheduled</h1>
    ${greeting(firstName)}
    <p>Your TimeTiles account deletion has been scheduled.</p>

    ${callout(`<p style="margin: 0;"><strong>Deletion Date:</strong> ${formattedDate}</p>`, "red")}

    <h2 style="font-size: 18px;">What happens next?</h2>
    <ul>
      <li><strong>Public data</strong> will be transferred to the system and remain accessible</li>
      <li><strong>Private data</strong> will be permanently deleted on the scheduled date</li>
      <li>You can <strong>cancel this deletion anytime</strong> before the scheduled date</li>
    </ul>

    <p>If you didn't request this deletion, please cancel it immediately and secure your account.</p>

    ${emailButton(cancelUrl, "Cancel Deletion", "#dc2626")}

    <p style="color: #666; font-size: 14px;">
      Or visit your account settings: <a href="${cancelUrl}">${cancelUrl}</a>
    </p>

  `);

  await safeSendEmail(
    payload,
    { to: email, subject: "Your TimeTiles account deletion is scheduled", html },
    "deletion-scheduled-email"
  );
};

/**
 * Send deletion cancelled email.
 */
export const sendDeletionCancelledEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined
): Promise<void> => {
  const html = emailLayout(`
    <h1 style="color: #16a34a;">Account Deletion Cancelled</h1>
    ${greeting(firstName)}
    <p>Good news! Your TimeTiles account deletion has been cancelled.</p>

    ${callout(`<p style="margin: 0;">Your account is now <strong>active</strong> and all your data is safe.</p>`, "green")}

    <p>If you didn't cancel this deletion, someone may have access to your account. We recommend:</p>
    <ul>
      <li>Changing your password immediately</li>
      <li>Reviewing your recent account activity</li>
    </ul>

  `);

  await safeSendEmail(
    payload,
    { to: email, subject: "Your TimeTiles account deletion has been cancelled", html },
    "deletion-cancelled-email"
  );
};

/**
 * Send deletion completed email.
 */
export const sendDeletionCompletedEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  dataTransferred: { catalogs: number; datasets: number },
  dataDeleted: { catalogs: number; datasets: number; events: number }
): Promise<void> => {
  const html = emailLayout(`
    <h1>Your TimeTiles Account Has Been Deleted</h1>
    ${greeting(firstName)}
    <p>Your TimeTiles account has been permanently deleted as scheduled.</p>

    <h2 style="font-size: 18px;">Summary of Changes</h2>

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">Public Data Transferred</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li>${dataTransferred.catalogs} catalog(s)</li>
        <li>${dataTransferred.datasets} dataset(s)</li>
      </ul>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
        This data remains publicly accessible.
      </p>`,
      "green"
    )}

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">Private Data Deleted</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li>${dataDeleted.catalogs} private catalog(s)</li>
        <li>${dataDeleted.datasets} private dataset(s)</li>
        <li>${dataDeleted.events} event(s)</li>
      </ul>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
        This data has been permanently removed.
      </p>`,
      "red"
    )}

    <p>Thank you for using TimeTiles. If you have any questions about your data, please contact support within 30 days.</p>

  `);

  await safeSendEmail(
    payload,
    { to: email, subject: "Your TimeTiles account has been deleted", html },
    "deletion-completed-email"
  );
};

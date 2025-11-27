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

import { createLogger, logError } from "../logger";

const logger = createLogger("account-deletion-emails");

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
  const deletionDate = new Date(deletionScheduledAt);
  const formattedDate = deletionDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #dc2626;">Account Deletion Scheduled</h1>
        <p>Hello${firstName ? ` ${firstName}` : ""},</p>
        <p>Your TimeTiles account deletion has been scheduled.</p>

        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Deletion Date:</strong> ${formattedDate}</p>
        </div>

        <h2 style="font-size: 18px;">What happens next?</h2>
        <ul>
          <li><strong>Public data</strong> will be transferred to the system and remain accessible</li>
          <li><strong>Private data</strong> will be permanently deleted on the scheduled date</li>
          <li>You can <strong>cancel this deletion anytime</strong> before the scheduled date</li>
        </ul>

        <p>If you didn't request this deletion, please cancel it immediately and secure your account.</p>

        <p style="margin: 30px 0;">
          <a href="${cancelUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Cancel Deletion
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or visit your account settings: <a href="${cancelUrl}">${cancelUrl}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This email was sent because an account deletion was requested for your TimeTiles account.
          If you have questions, please contact support.
        </p>
      </body>
    </html>
  `;

  try {
    await payload.sendEmail({
      to: email,
      subject: "Your TimeTiles account deletion is scheduled",
      html,
    });
    logger.info({ email }, "Deletion scheduled email sent");
  } catch (error) {
    logError(error, "Failed to send deletion scheduled email", { email });
    // Don't throw - email failure shouldn't block deletion
  }
};

/**
 * Send deletion cancelled email.
 */
export const sendDeletionCancelledEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined
): Promise<void> => {
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #16a34a;">Account Deletion Cancelled</h1>
        <p>Hello${firstName ? ` ${firstName}` : ""},</p>
        <p>Good news! Your TimeTiles account deletion has been cancelled.</p>

        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0;">
          <p style="margin: 0;">Your account is now <strong>active</strong> and all your data is safe.</p>
        </div>

        <p>If you didn't cancel this deletion, someone may have access to your account. We recommend:</p>
        <ul>
          <li>Changing your password immediately</li>
          <li>Reviewing your recent account activity</li>
        </ul>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This email was sent because an account deletion was cancelled for your TimeTiles account.
        </p>
      </body>
    </html>
  `;

  try {
    await payload.sendEmail({
      to: email,
      subject: "Your TimeTiles account deletion has been cancelled",
      html,
    });
    logger.info({ email }, "Deletion cancelled email sent");
  } catch (error) {
    logError(error, "Failed to send deletion cancelled email", { email });
  }
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
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1>Your TimeTiles Account Has Been Deleted</h1>
        <p>Hello${firstName ? ` ${firstName}` : ""},</p>
        <p>Your TimeTiles account has been permanently deleted as scheduled.</p>

        <h2 style="font-size: 18px;">Summary of Changes</h2>

        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Public Data Transferred</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>${dataTransferred.catalogs} catalog(s)</li>
            <li>${dataTransferred.datasets} dataset(s)</li>
          </ul>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
            This data remains publicly accessible.
          </p>
        </div>

        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Private Data Deleted</h3>
          <ul style="margin: 0; padding-left: 20px;">
            <li>${dataDeleted.catalogs} private catalog(s)</li>
            <li>${dataDeleted.datasets} private dataset(s)</li>
            <li>${dataDeleted.events} event(s)</li>
          </ul>
          <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
            This data has been permanently removed.
          </p>
        </div>

        <p>Thank you for using TimeTiles. If you have any questions about your data, please contact support within 30 days.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This is a confirmation of your account deletion. No further action is required.
        </p>
      </body>
    </html>
  `;

  try {
    await payload.sendEmail({
      to: email,
      subject: "Your TimeTiles account has been deleted",
      html,
    });
    logger.info({ email }, "Deletion completed email sent");
  } catch (error) {
    logError(error, "Failed to send deletion completed email", { email });
  }
};

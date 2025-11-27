/**
 * Email templates and sending functions for data export.
 *
 * Provides HTML email templates for:
 * - Export ready notification with download link
 * - Export failed notification with retry guidance
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { createLogger, logError } from "../logger";

const logger = createLogger("data-export-emails");

/**
 * Send export ready notification email.
 */
export const sendExportReadyEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  downloadUrl: string,
  expiresAt: string,
  fileSizeMB: number
): Promise<void> => {
  const expiryDate = new Date(expiresAt);
  const formattedDate = expiryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const settingsUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #16a34a;">Your Data Export is Ready</h1>
        <p>Hello${firstName ? ` ${firstName}` : ""},</p>
        <p>Good news! Your TimeTiles data export has been completed and is ready for download.</p>

        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px;">Export Details</h3>
          <ul style="margin: 0; padding-left: 20px; list-style: none;">
            <li><strong>Size:</strong> ${fileSizeMB.toFixed(2)} MB</li>
            <li><strong>Expires:</strong> ${formattedDate}</li>
          </ul>
        </div>

        <p style="margin: 30px 0;">
          <a href="${downloadUrl}" style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
            Download My Data
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          Or visit your account settings:<br>
          <a href="${settingsUrl}">${settingsUrl}</a>
        </p>

        <h2 style="font-size: 18px;">What's included?</h2>
        <ul>
          <li>Your profile information</li>
          <li>All catalogs you've created</li>
          <li>All datasets and their configurations</li>
          <li>All events in your datasets</li>
          <li>Import history and scheduled imports</li>
          <li>Media files you've uploaded</li>
        </ul>

        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;">
            <strong>Important:</strong> This download link will expire in 7 days.
            After that, you'll need to request a new export from your account settings.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This email was sent because you requested a data export for your TimeTiles account.
          If you didn't request this export, please secure your account by changing your password.
        </p>
      </body>
    </html>
  `;

  try {
    await payload.sendEmail({
      to: email,
      subject: "Your TimeTiles data export is ready",
      html,
    });
    logger.info({ email }, "Export ready email sent");
  } catch (error) {
    logError(error, "Failed to send export ready email", { email });
    // Don't throw - email failure shouldn't block export completion
  }
};

/**
 * Send export failed notification email.
 */
export const sendExportFailedEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  errorReason?: string
): Promise<void> => {
  const settingsUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #dc2626;">Data Export Failed</h1>
        <p>Hello${firstName ? ` ${firstName}` : ""},</p>
        <p>Unfortunately, we couldn't complete your data export. This may be due to a temporary technical issue.</p>

        ${
          errorReason
            ? `
        <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px;">
            <strong>Error:</strong> ${errorReason}
          </p>
        </div>
        `
            : ""
        }

        <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 16px; margin: 20px 0;">
          <p style="margin: 0;">
            <strong>What you can do:</strong>
          </p>
          <ol style="margin: 10px 0 0 0; padding-left: 20px;">
            <li>Visit your account settings and try again</li>
            <li>If the problem persists, please contact support</li>
          </ol>
        </div>

        <p style="margin: 30px 0;">
          <a href="${settingsUrl}" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Try Again
          </a>
        </p>

        <p>We apologize for the inconvenience.</p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This email was sent because a data export request for your TimeTiles account encountered an error.
        </p>
      </body>
    </html>
  `;

  try {
    await payload.sendEmail({
      to: email,
      subject: "Your TimeTiles data export could not be completed",
      html,
    });
    logger.info({ email }, "Export failed email sent");
  } catch (error) {
    logError(error, "Failed to send export failed email", { email });
  }
};

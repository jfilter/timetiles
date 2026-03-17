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

import { callout, emailButton, emailFooter, emailLayout, greeting } from "@/lib/email/layout";
import { formatLongDate } from "@/lib/utils/date";
import { safeSendEmail } from "@/lib/utils/email";

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
  const formattedDate = formatLongDate(expiresAt, true);
  const settingsUrl = `${process.env.NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;

  const html = emailLayout(`
    <h1 style="color: #16a34a;">Your Data Export is Ready</h1>
    ${greeting(firstName)}
    <p>Good news! Your TimeTiles data export has been completed and is ready for download.</p>

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">Export Details</h3>
      <ul style="margin: 0; padding-left: 20px; list-style: none;">
        <li><strong>Size:</strong> ${fileSizeMB.toFixed(2)} MB</li>
        <li><strong>Expires:</strong> ${formattedDate}</li>
      </ul>`,
      "green"
    )}

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

    ${callout(
      `<p style="margin: 0; font-size: 14px;">
        <strong>Important:</strong> This download link will expire in 7 days.
        After that, you'll need to request a new export from your account settings.
      </p>`,
      "amber"
    )}

    ${emailFooter("This email was sent because you requested a data export for your TimeTiles account. If you didn't request this export, please secure your account by changing your password.")}
  `);

  await safeSendEmail(
    payload,
    { to: email, subject: "Your TimeTiles data export is ready", html },
    "export-ready-email"
  );
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

  const html = emailLayout(`
    <h1 style="color: #dc2626;">Data Export Failed</h1>
    ${greeting(firstName)}
    <p>Unfortunately, we couldn't complete your data export. This may be due to a temporary technical issue.</p>

    ${
      errorReason
        ? callout(`<p style="margin: 0; font-size: 14px;"><strong>Error:</strong> ${errorReason}</p>`, "red")
        : ""
    }

    ${callout(
      `<p style="margin: 0;"><strong>What you can do:</strong></p>
      <ol style="margin: 10px 0 0 0; padding-left: 20px;">
        <li>Visit your account settings and try again</li>
        <li>If the problem persists, please contact support</li>
      </ol>`,
      "gray"
    )}

    ${emailButton(settingsUrl, "Try Again")}

    <p>We apologize for the inconvenience.</p>

    ${emailFooter("This email was sent because a data export request for your TimeTiles account encountered an error.")}
  `);

  await safeSendEmail(
    payload,
    { to: email, subject: "Your TimeTiles data export could not be completed", html },
    "export-failed-email"
  );
};

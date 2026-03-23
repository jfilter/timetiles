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

import { getEnv } from "@/lib/config/env";
import { getEmailBranding } from "@/lib/email/branding";
import { getEmailTranslations } from "@/lib/email/i18n";
import { callout, emailButton, emailLayout, greeting } from "@/lib/email/layout";
import { safeSendEmail } from "@/lib/email/send";
import { formatLongDate } from "@/lib/utils/date";

/**
 * Send export ready notification email.
 */
export const sendExportReadyEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  downloadUrl: string,
  expiresAt: string,
  fileSizeMB: number,
  locale?: string | null
): Promise<void> => {
  const branding = await getEmailBranding(payload);
  const t = getEmailTranslations(locale, { siteName: branding.siteName });
  const formattedDate = formatLongDate(expiresAt, true);
  const settingsUrl = `${getEnv().NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;

  const html = emailLayout(
    `
    <h1 style="color: #16a34a;">${t("exportReadyTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("exportReadyBody")}</p>

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">${t("exportReadyDetails")}</h3>
      <ul style="margin: 0; padding-left: 20px; list-style: none;">
        <li><strong>${t("exportReadySize")}</strong> ${fileSizeMB.toFixed(2)} MB</li>
        <li><strong>${t("exportReadyExpires")}</strong> ${formattedDate}</li>
      </ul>`,
      "green"
    )}

    <p style="margin: 30px 0;">
      <a href="${downloadUrl}" style="background-color: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500;">
        ${t("downloadDataBtn")}
      </a>
    </p>

    <p style="color: #666; font-size: 14px;">
      ${t("exportReadySettings")}<br>
      <a href="${settingsUrl}">${settingsUrl}</a>
    </p>

    <h2 style="font-size: 18px;">${t("exportReadyIncludes")}</h2>
    <ul>
      <li>${t("exportReadyProfile")}</li>
      <li>${t("exportReadyCatalogs")}</li>
      <li>${t("exportReadyDatasets")}</li>
      <li>${t("exportReadyEvents")}</li>
      <li>${t("exportReadyImports")}</li>
      <li>${t("exportReadyMedia")}</li>
    </ul>

    ${callout(
      `<p style="margin: 0; font-size: 14px;">
        <strong>${t("exportReadyExpiry")}</strong>
      </p>`,
      "amber"
    )}

    <p style="color: #666; font-size: 14px;">
      ${t("exportReadySecurityWarning")}
    </p>
  `,
    t,
    branding.logoUrl
  );

  await safeSendEmail(payload, { to: email, subject: t("exportReadySubject"), html }, "export-ready-email");
};

/**
 * Send export failed notification email.
 */
export const sendExportFailedEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  errorReason?: string,
  locale?: string | null
): Promise<void> => {
  const branding = await getEmailBranding(payload);
  const t = getEmailTranslations(locale, { siteName: branding.siteName });
  const settingsUrl = `${getEnv().NEXT_PUBLIC_PAYLOAD_URL}/account/settings`;

  const html = emailLayout(
    `
    <h1 style="color: #dc2626;">${t("exportFailedTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("exportFailedBody")}</p>

    ${
      errorReason
        ? callout(
            `<p style="margin: 0; font-size: 14px;"><strong>${t("exportFailedError")}</strong> ${errorReason}</p>`,
            "red"
          )
        : ""
    }

    ${callout(
      `<p style="margin: 0;"><strong>${t("exportFailedActions")}</strong></p>
      <ol style="margin: 10px 0 0 0; padding-left: 20px;">
        <li>${t("exportFailedRetry")}</li>
        <li>${t("exportFailedContact")}</li>
      </ol>`,
      "gray"
    )}

    ${emailButton(settingsUrl, t("tryAgainBtn"))}

    <p>${t("exportFailedApology")}</p>

  `,
    t,
    branding.logoUrl
  );

  await safeSendEmail(payload, { to: email, subject: t("exportFailedSubject"), html }, "export-failed-email");
};

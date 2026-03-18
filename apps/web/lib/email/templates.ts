/**
 * Reusable HTML email templates for transactional emails.
 *
 * Templates are kept in a single module so route handlers stay focused on
 * business logic instead of inlining large HTML strings.
 *
 * @module
 * @category Email
 */

import { getEmailTranslations } from "@/lib/email/i18n";

import { emailButton, emailLayout, greeting } from "./layout";

/**
 * Notification sent to the **old** email address after an email change.
 */
export const buildOldEmailNotificationHtml = (firstName: string, locale?: string | null): string => {
  const t = getEmailTranslations(locale);

  return emailLayout(
    `
    <h1>${t("emailChangedTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("emailChangedBody")}</p>
    <p>${t("emailChangedWarning")}</p>
  `,
    t
  );
};

/**
 * Verification email sent to the **new** email address after an email change.
 */
export const buildVerificationEmailHtml = (verifyUrl: string, firstName: string, locale?: string | null): string => {
  const t = getEmailTranslations(locale);

  return emailLayout(
    `
    <h1>${t("emailVerifyTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("emailVerifyBody")}</p>
    ${emailButton(verifyUrl, t("verifyEmailBtn"))}
    <p>${t("orCopyLink")}</p>
    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>${t("emailVerifyWarning")}</p>
  `,
    t
  );
};

/**
 * Notification sent when someone attempts to register with an email
 * that already has an account (anti-enumeration measure).
 */
export const generateAccountExistsEmailHTML = (resetUrl: string, locale?: string | null): string => {
  const t = getEmailTranslations(locale);

  return emailLayout(
    `
    <h1>${t("accountExistsTitle")}</h1>
    ${greeting(t)}
    <p>${t("accountExistsBody")}</p>
    <p>${t("accountExistsExplain")}</p>
    <p><strong>${t("accountExistsIfYou")}</strong></p>
    <ul>
      <li>${t("accountExistsForgot")}</li>
      <li>${t("accountExistsReset")}</li>
    </ul>
    ${emailButton(resetUrl, t("resetPasswordBtn"))}
    <p><strong>${t("accountExistsIfNot")}</strong></p>
    <p>${t("accountExistsIgnore")}</p>
    <p style="margin-top: 30px; color: #666; font-size: 12px;">
      ${t("footer")}
    </p>
  `,
    t
  );
};

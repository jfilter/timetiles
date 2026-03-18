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

import { getEmailTranslations } from "@/lib/email/i18n";
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
  cancelUrl: string,
  locale?: string | null
): Promise<void> => {
  const t = getEmailTranslations(locale);
  const formattedDate = formatLongDate(deletionScheduledAt);

  const html = emailLayout(
    `
    <h1 style="color: #dc2626;">${t("deletionScheduledTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("deletionScheduledBody")}</p>

    ${callout(`<p style="margin: 0;"><strong>${t("deletionScheduledDate")}</strong> ${formattedDate}</p>`, "red")}

    <h2 style="font-size: 18px;">${t("deletionScheduledNext")}</h2>
    <ul>
      <li><strong>${t("deletionScheduledPublic")}</strong></li>
      <li><strong>${t("deletionScheduledPrivate")}</strong></li>
      <li><strong>${t("deletionScheduledCancel")}</strong></li>
    </ul>

    <p>${t("deletionScheduledWarning")}</p>

    ${emailButton(cancelUrl, t("cancelDeletionBtn"), "#dc2626")}

    <p style="color: #666; font-size: 14px;">
      ${t("deletionScheduledLink")} <a href="${cancelUrl}">${cancelUrl}</a>
    </p>

  `,
    t
  );

  await safeSendEmail(payload, { to: email, subject: t("deletionScheduledSubject"), html }, "deletion-scheduled-email");
};

/**
 * Send deletion cancelled email.
 */
export const sendDeletionCancelledEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  locale?: string | null
): Promise<void> => {
  const t = getEmailTranslations(locale);

  const html = emailLayout(
    `
    <h1 style="color: #16a34a;">${t("deletionCancelledTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("deletionCancelledBody")}</p>

    ${callout(`<p style="margin: 0;">${t("deletionCancelledActive")}</p>`, "green")}

    <p>${t("deletionCancelledWarning")}</p>
    <ul>
      <li>${t("deletionCancelledChangePassword")}</li>
      <li>${t("deletionCancelledReviewActivity")}</li>
    </ul>

  `,
    t
  );

  await safeSendEmail(payload, { to: email, subject: t("deletionCancelledSubject"), html }, "deletion-cancelled-email");
};

/**
 * Send deletion completed email.
 */
export const sendDeletionCompletedEmail = async (
  payload: Payload,
  email: string,
  firstName: string | null | undefined,
  dataTransferred: { catalogs: number; datasets: number },
  dataDeleted: { catalogs: number; datasets: number; events: number },
  locale?: string | null
): Promise<void> => {
  const t = getEmailTranslations(locale);

  const html = emailLayout(
    `
    <h1>${t("deletionCompletedTitle")}</h1>
    ${greeting(t, firstName)}
    <p>${t("deletionCompletedBody")}</p>

    <h2 style="font-size: 18px;">${t("deletionCompletedSummary")}</h2>

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">${t("deletionCompletedTransferred")}</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li>${t("deletionCompletedCatalogs", { count: dataTransferred.catalogs })}</li>
        <li>${t("deletionCompletedDatasets", { count: dataTransferred.datasets })}</li>
      </ul>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
        ${t("deletionCompletedTransferredNote")}
      </p>`,
      "green"
    )}

    ${callout(
      `<h3 style="margin: 0 0 10px 0; font-size: 16px;">${t("deletionCompletedDeleted")}</h3>
      <ul style="margin: 0; padding-left: 20px;">
        <li>${t("deletionCompletedPrivateCatalogs", { count: dataDeleted.catalogs })}</li>
        <li>${t("deletionCompletedPrivateDatasets", { count: dataDeleted.datasets })}</li>
        <li>${t("deletionCompletedEvents", { count: dataDeleted.events })}</li>
      </ul>
      <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
        ${t("deletionCompletedDeletedNote")}
      </p>`,
      "red"
    )}

    <p>${t("deletionCompletedThanks")}</p>

  `,
    t
  );

  await safeSendEmail(payload, { to: email, subject: t("deletionCompletedSubject"), html }, "deletion-completed-email");
};

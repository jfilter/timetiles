/**
 * Email templates for scheduled-ingest lifecycle alerts.
 *
 * Notifies the owner (the user who created the scheduled ingest) when their
 * schedule is auto-disabled by the pipeline. Two templates:
 * - Invalid schedule configuration (unparseable cron/frequency)
 * - Retry budget exhausted (too many consecutive failures)
 *
 * Both events cause the pipeline to flip `enabled: false` on the record, so
 * they fire at most once per breakage — spam risk is bounded by design.
 *
 * @module
 * @category Services
 */
import type { Payload } from "payload";

import { getEmailContext } from "@/lib/email/context";
import { callout, emailButton, emailLayout, greeting } from "@/lib/email/layout";
import { EMAIL_CONTEXTS, queueEmail } from "@/lib/email/send";
import type { ScheduledIngest } from "@/payload-types";

/** Recipient shape — matches the fields we read off the user record. */
interface EmailRecipient {
  email: string;
  firstName?: string | null;
  locale?: string | null;
}

/**
 * Build the Payload admin URL for a scheduled-ingest edit page.
 *
 * Exported so tests can assert on the generated link without re-deriving it.
 */
export const buildScheduledIngestAdminUrl = (serverURL: string | null | undefined, id: number | string): string => {
  const base = (serverURL ?? "").replace(/\/$/, "");
  return `${base}/admin/collections/scheduled-ingests/${id}`;
};

/** Render a small "Type: cron \"* * * * *\"" / "Type: frequency \"hourly\"" summary line. */
const renderScheduleSummary = (scheduledIngest: ScheduledIngest): string => {
  if (scheduledIngest.scheduleType === "cron") {
    return `cron <code>${scheduledIngest.cronExpression ?? ""}</code>`;
  }
  return `frequency <code>${scheduledIngest.frequency ?? ""}</code>`;
};

/**
 * Notify the owner that their scheduled ingest was disabled because its
 * schedule configuration could not be parsed (invalid cron expression or
 * missing frequency). Fire-and-forget — delivery failures are logged and
 * swallowed so they can't mask the disable operation or the audit entry.
 */
export const sendScheduledIngestConfigInvalidEmail = async (
  payload: Payload,
  owner: EmailRecipient,
  scheduledIngest: ScheduledIngest,
  errorMessage: string
): Promise<void> => {
  const { branding, t } = await getEmailContext(payload, owner.locale);
  const adminUrl = buildScheduledIngestAdminUrl(payload.config.serverURL, scheduledIngest.id);
  const name = scheduledIngest.name ?? "";

  const html = emailLayout(
    `
    <h1 style="color: #dc2626;">${t("scheduledIngestConfigInvalidTitle")}</h1>
    ${greeting(t, owner.firstName)}
    <p>${t("scheduledIngestConfigInvalidBody", { name })}</p>

    ${callout(
      `<p style="margin: 0 0 8px 0;"><strong>${t("scheduledIngestLabel")}</strong> ${name}</p>
       <p style="margin: 0 0 8px 0;"><strong>${t("scheduledIngestTypeLabel")}</strong> ${renderScheduleSummary(scheduledIngest)}</p>
       <p style="margin: 0;"><strong>${t("scheduledIngestErrorLabel")}</strong> ${errorMessage}</p>`,
      "red"
    )}

    <p>${t("scheduledIngestConfigInvalidAction")}</p>

    ${emailButton(adminUrl, t("editScheduleBtn"), "#dc2626")}
  `,
    t,
    branding.logoUrl
  );

  await queueEmail(
    payload,
    { to: owner.email, subject: t("scheduledIngestConfigInvalidSubject", { name }), html },
    EMAIL_CONTEXTS.SCHEDULED_INGEST_CONFIG_INVALID
  );
};

/**
 * Notify the owner that their scheduled ingest was disabled after exceeding
 * the configured retry budget. Fire-and-forget.
 */
export const sendScheduledIngestRetriesExhaustedEmail = async (
  payload: Payload,
  owner: EmailRecipient,
  scheduledIngest: ScheduledIngest,
  currentRetries: number,
  maxRetries: number,
  lastError: string
): Promise<void> => {
  const { branding, t } = await getEmailContext(payload, owner.locale);
  const adminUrl = buildScheduledIngestAdminUrl(payload.config.serverURL, scheduledIngest.id);
  const name = scheduledIngest.name ?? "";

  const html = emailLayout(
    `
    <h1 style="color: #dc2626;">${t("scheduledIngestRetriesExhaustedTitle")}</h1>
    ${greeting(t, owner.firstName)}
    <p>${t("scheduledIngestRetriesExhaustedBody", { name, currentRetries, maxRetries })}</p>

    ${callout(
      `<p style="margin: 0 0 8px 0;"><strong>${t("scheduledIngestLabel")}</strong> ${name}</p>
       <p style="margin: 0 0 8px 0;"><strong>${t("scheduledIngestTypeLabel")}</strong> ${renderScheduleSummary(scheduledIngest)}</p>
       <p style="margin: 0;"><strong>${t("scheduledIngestErrorLabel")}</strong> ${lastError}</p>`,
      "red"
    )}

    <p>${t("scheduledIngestRetriesExhaustedAction")}</p>

    ${emailButton(adminUrl, t("editScheduleBtn"), "#dc2626")}
  `,
    t,
    branding.logoUrl
  );

  await queueEmail(
    payload,
    { to: owner.email, subject: t("scheduledIngestRetriesExhaustedSubject", { name }), html },
    EMAIL_CONTEXTS.SCHEDULED_INGEST_RETRIES_EXHAUSTED
  );
};

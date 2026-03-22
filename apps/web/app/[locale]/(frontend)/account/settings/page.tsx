/**
 * Account settings page.
 *
 * Allows users to view their profile information and manage account settings,
 * including scheduling account deletion with a 7-day grace period.
 *
 * @module
 * @category Pages
 */
import { headers as nextHeaders } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";
import config from "@/payload.config";

import { AccountPageShell } from "../_components/account-page-shell";
import { AccountSettingsClient } from "./_components/account-settings-client";

export const metadata = {
  title: "Account Settings | TimeTiles",
  description: "Manage your TimeTiles account settings",
};

export default async function AccountSettingsPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();

  const { user } = await payload.auth({ headers });

  if (!user) {
    const locale = await getLocale();
    return redirect({ href: "/login?redirect=/account/settings", locale });
  }

  const t = await getTranslations("Account");

  return (
    <AccountPageShell title={t("settings")} description={t("settingsDescription")} maxWidth="2xl">
      <AccountSettingsClient user={user} />
    </AccountPageShell>
  );
}

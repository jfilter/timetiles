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
import { redirect } from "next/navigation";
import { getPayload } from "payload";

import config from "@/payload.config";

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
    redirect("/login?redirect=/account/settings");
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">Account Settings</h1>

      <AccountSettingsClient user={user} />
    </div>
  );
}

/**
 * Data packages page (account section).
 *
 * Browse and activate curated data packages that provide pre-configured
 * data sources for one-click import. Requires authentication.
 *
 * @module
 */
import type { Metadata } from "next";
import { headers as nextHeaders } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";
import config from "@/payload.config";

import { AccountPageShell } from "../_components/account-page-shell";
import { DataPackagesList } from "./_components/data-packages-list";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("DataPackages");
  return { title: `${t("title")} | TimeTiles`, description: t("metaDescription") };
};

export default async function DataPackagesPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();

  const { user } = await payload.auth({ headers });

  if (!user) {
    const locale = await getLocale();
    return redirect({ href: "/login?redirect=/account/data-packages", locale });
  }

  const t = await getTranslations("DataPackages");

  return (
    <AccountPageShell title={t("title")} description={t("subtitle")} maxWidth="5xl">
      <DataPackagesList />
    </AccountPageShell>
  );
}

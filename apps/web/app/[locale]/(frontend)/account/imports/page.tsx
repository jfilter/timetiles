/**
 * Import activity dashboard page.
 *
 * Unified view for manual imports, scheduled ingests, and scrapers.
 *
 * @module
 * @category Pages
 */
import { headers as nextHeaders } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";
import { redirectIfNotDefaultSite } from "@/lib/api/server-page-helpers";
import { getFeatureFlagService } from "@/lib/services/feature-flag-service";
import config from "@/payload.config";

import { AccountPageShell } from "../_components/account-page-shell";
import { ImportActivityDashboard } from "./_components/import-activity-dashboard";

export const metadata = {
  title: "Import Activity | TimeTiles",
  description: "Monitor and manage all your data imports",
};

export default async function ImportsPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();
  const locale = await getLocale();

  const { user } = await payload.auth({ headers });

  if (!user) {
    return redirect({ href: "/login?redirect=/account/imports", locale });
  }

  await redirectIfNotDefaultSite(payload, headers, locale);

  const scrapersEnabled = await getFeatureFlagService(payload).isEnabled("enableScrapers");

  const [ingestFilesResult, schedulesResult, reposResult, scrapersResult] = await Promise.all([
    payload.find({
      collection: "ingest-files",
      where: { user: { equals: user.id } },
      sort: "-createdAt",
      limit: 200,
      pagination: false,
      depth: 1,
    }),
    payload.find({
      collection: "scheduled-ingests",
      where: { createdBy: { equals: user.id } },
      sort: "-updatedAt",
      limit: 200,
      pagination: false,
      depth: 1,
    }),
    payload.find({
      collection: "scraper-repos",
      where: { createdBy: { equals: user.id } },
      sort: "-updatedAt",
      limit: 200,
      pagination: false,
      depth: 1,
    }),
    payload.find({
      collection: "scrapers",
      where: { repoCreatedBy: { equals: user.id } },
      sort: "-updatedAt",
      limit: 200,
      pagination: false,
      depth: 1,
    }),
  ]);

  const t = await getTranslations("ImportActivity");

  return (
    <AccountPageShell title={t("title")} description={t("description")} maxWidth="5xl">
      <ImportActivityDashboard
        initialIngestFiles={ingestFilesResult.docs}
        initialSchedules={schedulesResult.docs}
        initialRepos={reposResult.docs}
        initialScrapers={scrapersResult.docs}
        scrapersEnabled={scrapersEnabled}
      />
    </AccountPageShell>
  );
}

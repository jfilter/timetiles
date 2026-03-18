/**
 * Scraper management page.
 *
 * Allows users to view and manage their scraper repositories, scrapers, and runs.
 *
 * @module
 * @category Pages
 */
import { headers as nextHeaders } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";

import { redirect } from "@/i18n/navigation";
import { isFeatureEnabled } from "@/lib/services/feature-flag-service";
import config from "@/payload.config";

import { ScrapersListClient } from "./_components/scrapers-list-client";

export const metadata = { title: "Scrapers | TimeTiles", description: "Manage your web scrapers" };

export default async function ScrapersPage() {
  const payload = await getPayload({ config });
  const headers = await nextHeaders();

  const { user } = await payload.auth({ headers });

  if (!user) {
    const locale = await getLocale();
    return redirect({ href: "/login?redirect=/account/scrapers", locale });
  }

  const scrapersEnabled = await isFeatureEnabled(payload, "enableScrapers");

  // Fetch user's scraper repos
  const reposResult = await payload.find({
    collection: "scraper-repos",
    where: { createdBy: { equals: user.id } },
    sort: "-updatedAt",
    limit: 200,
    pagination: false,
    depth: 1,
  });

  // Fetch user's scrapers
  const scrapersResult = await payload.find({
    collection: "scrapers",
    where: { repoCreatedBy: { equals: user.id } },
    sort: "-updatedAt",
    limit: 200,
    pagination: false,
    depth: 1,
  });

  const t = await getTranslations("Scrapers");

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("description")}</p>
        </div>
      </div>

      {!scrapersEnabled && <div className="bg-muted mb-6 rounded-lg border p-4 text-sm">{t("featureDisabled")}</div>}

      <ScrapersListClient initialRepos={reposResult.docs} initialScrapers={scrapersResult.docs} />
    </div>
  );
}

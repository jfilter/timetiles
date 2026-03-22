/**
 * Client component for the unified import activity dashboard.
 *
 * Renders tabbed interface with Manual Imports, Scheduled Ingests, and Scrapers tables.
 *
 * @module
 * @category Components
 */
"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@timetiles/ui";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { useRouter } from "@/i18n/navigation";
import type { IngestFile, ScheduledIngest, Scraper, ScraperRepo } from "@/payload-types";

import { ManualImportsTable } from "./manual-imports-table";
import { ScheduledIngestsTable } from "./scheduled-ingests-table";
import { ScrapersTable } from "./scrapers-table";

const VALID_TABS = new Set(["manual", "scheduled", "scrapers"]);

interface ImportActivityDashboardProps {
  readonly initialIngestFiles: IngestFile[];
  readonly initialSchedules: ScheduledIngest[];
  readonly initialRepos: ScraperRepo[];
  readonly initialScrapers: Scraper[];
  readonly scrapersEnabled: boolean;
}

const DashboardTabs = ({
  initialIngestFiles,
  initialSchedules,
  initialRepos,
  initialScrapers,
  scrapersEnabled,
}: ImportActivityDashboardProps) => {
  const t = useTranslations("ImportActivity");
  const searchParams = useSearchParams();
  const router = useRouter();

  const tabParam = searchParams.get("tab");
  const activeTab = tabParam && VALID_TABS.has(tabParam) ? tabParam : "manual";

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`/account/imports?${params.toString()}`);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="manual">{t("tabImports")}</TabsTrigger>
        <TabsTrigger value="scheduled">{t("tabSchedules")}</TabsTrigger>
        <TabsTrigger value="scrapers">{t("tabScrapers")}</TabsTrigger>
      </TabsList>
      <TabsContent value="manual">
        <ManualImportsTable initialData={initialIngestFiles} />
      </TabsContent>
      <TabsContent value="scheduled">
        <ScheduledIngestsTable initialData={initialSchedules} />
      </TabsContent>
      <TabsContent value="scrapers">
        {scrapersEnabled ? (
          <ScrapersTable initialRepos={initialRepos} initialScrapers={initialScrapers} />
        ) : (
          <div className="text-muted-foreground py-12 text-center text-sm">{t("scrapersDisabled")}</div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export const ImportActivityDashboard = (props: ImportActivityDashboardProps) => (
  <Suspense>
    <DashboardTabs {...props} />
  </Suspense>
);

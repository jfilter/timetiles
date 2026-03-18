/**
 * This file defines the list-based data exploration page.
 *
 * Resolves the active view from search params and wraps the explorer
 * in a ViewProvider, matching the map explore page's context setup.
 *
 * @module
 */
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getPayload } from "payload";
import { Suspense } from "react";

import { ListExplorer } from "@/app/[locale]/(frontend)/explore/_components/list-explorer";
import { Link } from "@/i18n/navigation";
import { ViewProvider } from "@/lib/context/view-context";
import { resolveSite } from "@/lib/services/site-resolver";
import { resolveView } from "@/lib/services/view-resolver";
import config from "@/payload.config";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

interface ExploreListPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreListPage({ searchParams }: Readonly<ExploreListPageProps>) {
  const payload = await getPayload({ config });
  const headersList = await headers();
  const host = headersList.get("host");

  const site = await resolveSite(payload, host);
  const siteId = site?.id;

  const params = await searchParams;
  const viewSlug = typeof params.view === "string" ? params.view : undefined;
  const view = await resolveView(payload, siteId, viewSlug);

  const t = await getTranslations("Explore");

  if (!view) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">{t("siteNotConfigured")}</h1>
        <p className="text-muted-foreground max-w-md">{t("siteNotConfiguredDescription")}</p>
        <Link
          href="/dashboard/collections/views"
          className="text-primary underline underline-offset-4 hover:opacity-80"
        >
          {t("goToDashboard")}
        </Link>
      </div>
    );
  }

  return (
    <ViewProvider view={view}>
      <Suspense fallback={<div>{t("loadingExplorer")}</div>}>
        <ListExplorer />
      </Suspense>
    </ViewProvider>
  );
}

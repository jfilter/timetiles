/**
 * List-based data exploration page.
 *
 * Resolves the active view via the shared ExploreViewResolver and renders
 * the list-focused explorer layout.
 *
 * @module
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ListExplorer } from "@/app/[locale]/(frontend)/explore/_components/list-explorer";

import { ExploreViewResolver } from "../_components/explore-view-resolver";

interface ExploreListPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ExploreListPage({ searchParams }: Readonly<ExploreListPageProps>) {
  const t = await getTranslations("Common");
  return (
    <ExploreViewResolver searchParams={searchParams}>
      <Suspense fallback={<div>{t("loading")}</div>}>
        <ListExplorer />
      </Suspense>
    </ExploreViewResolver>
  );
}

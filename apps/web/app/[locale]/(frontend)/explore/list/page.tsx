/**
 * List-based data exploration page.
 *
 * Resolves the active view via the shared ExploreViewResolver and renders
 * the list-focused explorer layout.
 *
 * @module
 */
import { Suspense } from "react";

import { ListExplorer } from "@/app/[locale]/(frontend)/explore/_components/list-explorer";

import { ExploreViewResolver } from "../_components/explore-view-resolver";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

interface ExploreListPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function ExploreListPage({ searchParams }: Readonly<ExploreListPageProps>) {
  return (
    <ExploreViewResolver searchParams={searchParams}>
      <Suspense fallback={<div>Loading...</div>}>
        <ListExplorer />
      </Suspense>
    </ExploreViewResolver>
  );
}

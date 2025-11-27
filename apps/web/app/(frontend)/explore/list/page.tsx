/**
 * This file defines the list-based data exploration page.
 *
 * Renders the ListExplorer component which handles fetching its own data
 * via React Query hooks (useDataSourcesQuery for catalogs/datasets).
 * This view provides an alternative to the map-focused explore page,
 * with a 2-column top section (map, chart) and paginated event list below.
 *
 * @module
 */
import { Suspense } from "react";

import { ListExplorer } from "@/app/(frontend)/explore/_components/list-explorer";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export default function ExploreListPage() {
  return (
    <Suspense fallback={LOADING_ELEMENT}>
      <ListExplorer />
    </Suspense>
  );
}

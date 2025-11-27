/**
 * This file defines the main data exploration page of the application.
 *
 * Renders the MapExplorer component which handles fetching its own data
 * via React Query hooks (useDataSourcesQuery for catalogs/datasets).
 *
 * @module
 */
import { Suspense } from "react";

import { MapExplorer } from "@/app/(frontend)/explore/_components/map-explorer";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export default function ExplorePage() {
  return (
    <Suspense fallback={LOADING_ELEMENT}>
      <MapExplorer />
    </Suspense>
  );
}

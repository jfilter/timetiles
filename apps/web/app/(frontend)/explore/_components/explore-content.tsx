/**
 * Shared explore content component used by the explore page.
 *
 * Renders MapExplorer on desktop and ListExplorer on mobile,
 * wrapped in a Suspense boundary.
 *
 * @module
 * @category Components
 */
import { Suspense } from "react";

import { ListExplorer } from "@/app/(frontend)/explore/_components/list-explorer";
import { MapExplorer } from "@/app/(frontend)/explore/_components/map-explorer";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export const ExploreContent = () => (
  <Suspense fallback={LOADING_ELEMENT}>
    {/* Desktop: MapExplorer with split view */}
    <div className="hidden md:block">
      <MapExplorer />
    </div>
    {/* Mobile: ListExplorer with tabbed navigation */}
    <div className="md:hidden">
      <ListExplorer />
    </div>
  </Suspense>
);

/**
 * This file defines the main data exploration page of the application.
 *
 * On desktop: Renders MapExplorer with split map/list view
 * On mobile: Renders ListExplorer with tabbed navigation (Map/Chart/List)
 *
 * This unifies the mobile experience - both /explore and /explore/list
 * show the same tabbed interface on mobile devices.
 *
 * @module
 */
import { Suspense } from "react";

import { ListExplorer } from "@/app/(frontend)/explore/_components/list-explorer";
import { MapExplorer } from "@/app/(frontend)/explore/_components/map-explorer";

// Force dynamic rendering to prevent build-time database queries
export const dynamic = "force-dynamic";

const LOADING_ELEMENT = <div>Loading explorer...</div>;

export default function ExplorePage() {
  return (
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
}

/**
 * Drawer component for event filtering controls.
 *
 * Provides a collapsible sidebar with filter options for events including
 * date range, dataset selection, and other filter criteria. Width is
 * controlled by parent CSS Grid layout; this component handles content
 * visibility transitions.
 *
 * @module
 * @category Components
 */
"use client";

import { EventFilters } from "@/components/filters/event-filters";
import type { Catalog, Dataset } from "@/payload-types";

interface FilterDrawerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
}

export const FilterDrawer = ({ catalogs, datasets }: Readonly<FilterDrawerProps>) => (
  <div className="bg-background h-full w-80 overflow-y-auto p-4">
    <EventFilters catalogs={catalogs} datasets={datasets} />
  </div>
);

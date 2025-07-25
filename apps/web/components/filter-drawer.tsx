"use client";

import { cn } from "@workspace/ui/lib/utils";

import type { Catalog, Dataset } from "../payload-types";
import { EventFilters } from "./event-filters";

interface FilterDrawerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
  isOpen: boolean;
  onToggle: () => void;
}

export const FilterDrawer = ({ catalogs, datasets, isOpen }: Readonly<FilterDrawerProps>) => (
  <>
    {/* Drawer Container */}
    <div
      className={cn(
        "relative h-full border-l bg-white transition-all duration-300 ease-in-out",
        isOpen ? "w-80" : "w-0",
      )}
    >
      {/* Drawer Content */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-80 overflow-hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* Drawer Header */}
        <div className="border-b bg-white p-4">
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>

        {/* Drawer Body */}
        <div className="h-full overflow-y-auto p-4 pb-20">
          <EventFilters catalogs={catalogs} datasets={datasets} />
        </div>
      </div>
    </div>
  </>
);

"use client";

import type { Catalog, Dataset } from "../payload-types";
import { EventFilters } from "./EventFilters";
import { cn } from "@workspace/ui/lib/utils";

interface FilterDrawerProps {
  catalogs: Catalog[];
  datasets: Dataset[];
  isOpen: boolean;
  onToggle: () => void;
}

export function FilterDrawer({
  catalogs,
  datasets,
  isOpen,
}: FilterDrawerProps) {
  return (
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
}

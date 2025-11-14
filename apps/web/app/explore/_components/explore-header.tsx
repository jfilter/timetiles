/**
 * Header component for the explore page.
 *
 * Provides navigation controls, filter toggle, and action buttons for
 * the explore interface. Shows filter count badge and manages drawer
 * visibility state.
 *
 * @module
 * @category Components
 */
"use client";

import { Download, Filter, Menu, Settings } from "lucide-react";

interface ExploreHeaderProps {
  onMenuClick?: () => void;
  onFilterToggle?: () => void;
  filterCount?: number;
  isFilterOpen?: boolean;
}

export const ExploreHeader = ({
  onMenuClick,
  onFilterToggle,
  filterCount = 0,
  isFilterOpen = true,
}: Readonly<ExploreHeaderProps>) => (
  <div className="flex h-16 items-center justify-between border-b bg-white px-6">
    {/* Left side - Title */}
    <div className="flex items-center gap-4">
      <h1 className="text-xl font-semibold">Event Explorer</h1>
      {filterCount > 0 && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-sm text-blue-700">
          {filterCount} filter{filterCount > 1 ? "s" : ""} active
        </span>
      )}
    </div>

    {/* Right side - Actions */}
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onFilterToggle}
        className={`rounded p-2 hover:bg-gray-100 ${isFilterOpen ? "bg-gray-100" : ""}`}
        title={isFilterOpen ? "Hide filters" : "Show filters"}
      >
        <Filter className="h-5 w-5" />
      </button>
      <button type="button" className="rounded p-2 hover:bg-gray-100" title="Export data">
        <Download className="h-5 w-5" />
      </button>
      <button type="button" className="rounded p-2 hover:bg-gray-100" title="Settings">
        <Settings className="h-5 w-5" />
      </button>
      <button type="button" onClick={onMenuClick} className="rounded p-2 hover:bg-gray-100 lg:hidden" title="Menu">
        <Menu className="h-5 w-5" />
      </button>
    </div>
  </div>
);

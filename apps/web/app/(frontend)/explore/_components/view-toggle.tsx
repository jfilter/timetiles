/**
 * Toggle button to switch between map and list explore views.
 *
 * Provides navigation between /explore (map view) and /explore/list (list view)
 * while preserving filter state via URL parameters. Uses animated navigation
 * for smooth fade transitions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { LayoutList, Map } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { useAnimatedNavigation } from "./animated-view";

interface ViewToggleProps {
  currentView: "map" | "list";
}

export const ViewToggle = ({ currentView }: ViewToggleProps) => {
  const searchParams = useSearchParams();
  const { navigateTo } = useAnimatedNavigation();

  // Preserve current filter params when switching views
  const queryString = searchParams.toString();
  const queryPart = queryString ? `?${queryString}` : "";
  const mapUrl = `/explore${queryPart}`;
  const listUrl = `/explore/list${queryPart}`;

  const handleMapClick = useCallback(() => {
    if (currentView !== "map") {
      navigateTo(mapUrl);
    }
  }, [currentView, mapUrl, navigateTo]);

  const handleListClick = useCallback(() => {
    if (currentView !== "list") {
      navigateTo(listUrl);
    }
  }, [currentView, listUrl, navigateTo]);

  return (
    // Hidden on mobile since both /explore and /explore/list show the same tabbed interface
    <div className="bg-muted hidden items-center gap-1 rounded-lg p-1 md:inline-flex">
      <Button
        variant={currentView === "map" ? "default" : "ghost"}
        size="sm"
        onClick={handleMapClick}
        className={cn("h-8 gap-2", currentView === "map" && "shadow-sm")}
      >
        <Map className="h-4 w-4" />
        <span className="hidden sm:inline">Map</span>
      </Button>
      <Button
        variant={currentView === "list" ? "default" : "ghost"}
        size="sm"
        onClick={handleListClick}
        className={cn("h-8 gap-2", currentView === "list" && "shadow-sm")}
      >
        <LayoutList className="h-4 w-4" />
        <span className="hidden sm:inline">List</span>
      </Button>
    </div>
  );
};

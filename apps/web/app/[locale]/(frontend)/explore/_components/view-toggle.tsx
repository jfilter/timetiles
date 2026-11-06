/**
 * Toggle button to switch between map and list explore views.
 *
 * Provides navigation between /explore (map view) and /explore/list (list view)
 * while preserving filter state via URL parameters. Uses the native View
 * Transitions API (enabled via next.config.mjs) for smooth fade transitions.
 *
 * @module
 * @category Components
 */
"use client";

import { Button } from "@timetiles/ui";
import { cn } from "@timetiles/ui/lib/utils";
import { LayoutList, Map } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { useUIStore } from "@/lib/store";

interface ViewToggleProps {
  currentView: "map" | "list";
}

export const ViewToggle = ({ currentView }: ViewToggleProps) => {
  const t = useTranslations("Explore");
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();
  const startViewSwitch = useUIStore((state) => state.startViewSwitch);
  const endViewSwitch = useUIStore((state) => state.endViewSwitch);
  const viewSwitch = useUIStore((state) => state.ui.viewSwitch);

  // Preserve current filter params when switching views
  const queryString = searchParams.toString();
  const queryPart = queryString ? `?${queryString}` : "";

  // Started synchronously on click so map moves right after it are held, ended once the switch commits.
  useEffect(() => {
    if (!isSwitching) endViewSwitch();
  }, [isSwitching, endViewSwitch]);
  useEffect(() => endViewSwitch, [endViewSwitch]);

  // A position the map settled on during the switch replaces the one in the pending navigation.
  // After the switch commits the store entry may still be set for a render, so only while switching.
  useEffect(() => {
    if (!isSwitching || !viewSwitch?.heldPosition) return;
    const params = new URLSearchParams(queryString);
    params.set("lat", String(viewSwitch.heldPosition.lat));
    params.set("lng", String(viewSwitch.heldPosition.lng));
    params.set("zoom", String(viewSwitch.heldPosition.zoom));
    startTransition(() => router.push(`${viewSwitch.path}?${params.toString()}`));
  }, [isSwitching, viewSwitch, queryString, router]);

  const switchTo = (path: string) => {
    startViewSwitch(path);
    startTransition(() => router.push(`${path}${queryPart}`));
  };

  const handleMapClick = () => {
    if (currentView !== "map") {
      switchTo("/explore");
    }
  };

  const handleListClick = () => {
    if (currentView !== "list") {
      switchTo("/explore/list");
    }
  };

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
        <span className="hidden sm:inline">{t("map")}</span>
      </Button>
      <Button
        variant={currentView === "list" ? "default" : "ghost"}
        size="sm"
        onClick={handleListClick}
        className={cn("h-8 gap-2", currentView === "list" && "shadow-sm")}
      >
        <LayoutList className="h-4 w-4" />
        <span className="hidden sm:inline">{t("list")}</span>
      </Button>
    </div>
  );
};

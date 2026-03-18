/**
 * Mobile tab navigation for list explore view.
 *
 * Provides bottom tab bar navigation between Map, Chart, and List views
 * on mobile devices. Uses opacity/pointer-events for state preservation
 * instead of conditional rendering.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { BarChart3, LayoutList, Map } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type TabType = "map" | "chart" | "list";

interface MobileTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  mapContent: ReactNode;
  chartContent: ReactNode;
  listContent: ReactNode;
}

const TAB_ICONS = { map: Map, chart: BarChart3, list: LayoutList } as const;

const TABS: TabType[] = ["map", "chart", "list"];

// Individual tab button component to avoid inline function in map
interface TabButtonProps {
  id: TabType;
  label: string;
  icon: typeof Map;
  isActive: boolean;
  onTabChange: (tab: TabType) => void;
}

const TabButton = ({ id, label, icon: Icon, isActive, onTabChange }: TabButtonProps) => {
  const handleClick = () => {
    onTabChange(id);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
        isActive ? "text-primary border-t-primary border-t-2" : "text-muted-foreground"
      )}
      aria-selected={isActive}
      role="tab"
      id={`tab-${id}`}
      aria-controls={`panel-${id}`}
      tabIndex={isActive ? 0 : -1}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
};

export const MobileTabs = ({ activeTab, onTabChange, mapContent, chartContent, listContent }: MobileTabsProps) => {
  const t = useTranslations("Explore");
  const TAB_CONFIG = [
    { id: "map" as const, label: t("map"), icon: TAB_ICONS.map },
    { id: "chart" as const, label: t("chart"), icon: TAB_ICONS.chart },
    { id: "list" as const, label: t("list"), icon: TAB_ICONS.list },
  ] as const;
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TABS.indexOf(activeTab);

    switch (e.key) {
      case "ArrowLeft": {
        const prevTab = TABS[Math.max(0, currentIndex - 1)];
        if (prevTab) onTabChange(prevTab);
        break;
      }
      case "ArrowRight": {
        const nextTab = TABS[Math.min(TABS.length - 1, currentIndex + 1)];
        if (nextTab) onTabChange(nextTab);
        break;
      }
      case "Home":
        onTabChange("map");
        break;
      case "End":
        onTabChange("list");
        break;
    }
  };

  const contentMap: Record<TabType, ReactNode> = { map: mapContent, chart: chartContent, list: listContent };

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      {/* Tab panels - use opacity/pointer-events for state preservation */}
      <div className="relative flex-1 overflow-hidden">
        {TAB_CONFIG.map(({ id }) => (
          <div
            key={id}
            id={`panel-${id}`}
            role="tabpanel"
            aria-labelledby={`tab-${id}`}
            className={cn(
              "absolute inset-0 transition-opacity duration-200",
              activeTab === id ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0",
              id !== "map" && "overflow-y-auto"
            )}
          >
            {contentMap[id]}
          </div>
        ))}
      </div>

      {/* Tab bar - sticky at bottom for thumb reach */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t backdrop-blur-sm">
        <div className="flex" role="tablist" aria-label="View options" tabIndex={0} onKeyDown={handleKeyDown}>
          {TAB_CONFIG.map(({ id, label, icon }) => (
            <TabButton
              key={id}
              id={id}
              label={label}
              icon={icon}
              isActive={activeTab === id}
              onTabChange={onTabChange}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

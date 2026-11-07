/**
 * Mobile tab navigation for list explore view.
 *
 * Provides bottom tab bar navigation between Map, Chart, and List views
 * on mobile devices. Only the active tab is mounted to avoid unnecessary
 * queries and rendering from hidden panels.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import { BarChart3, LayoutList, Map } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useRef } from "react";

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

/** Target tab for a tablist navigation key, or null for other keys. */
const tabForKey = (key: string, current: TabType): TabType | null => {
  const currentIndex = TABS.indexOf(current);
  switch (key) {
    case "ArrowLeft":
      return TABS[Math.max(0, currentIndex - 1)] ?? null;
    case "ArrowRight":
      return TABS[Math.min(TABS.length - 1, currentIndex + 1)] ?? null;
    case "Home":
      return TABS[0] ?? null;
    case "End":
      return TABS[TABS.length - 1] ?? null;
    default:
      return null;
  }
};

// Individual tab button component to avoid inline function in map
interface TabButtonProps {
  id: TabType;
  label: string;
  icon: typeof Map;
  isActive: boolean;
  onSelect: (tab: TabType) => void;
  onNavigate: (event: React.KeyboardEvent<HTMLButtonElement>, tab: TabType) => void;
  buttonRef: (tab: TabType, element: HTMLButtonElement | null) => void;
}

const TabButton = ({ id, label, icon: Icon, isActive, onSelect, onNavigate, buttonRef }: TabButtonProps) => {
  const handleClick = () => onSelect(id);
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => onNavigate(event, id);
  const setRef = (element: HTMLButtonElement | null) => buttonRef(id, element);

  return (
    <button
      ref={setRef}
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
        isActive ? "text-primary border-t-primary border-t-2" : "text-muted-foreground"
      )}
      aria-selected={isActive}
      role="tab"
      id={`tab-${id}`}
      aria-controls={isActive ? `panel-${id}` : undefined}
      tabIndex={isActive ? 0 : -1}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      {label}
    </button>
  );
};

export const MobileTabs = ({ activeTab, onTabChange, mapContent, chartContent, listContent }: MobileTabsProps) => {
  const t = useTranslations("Explore");
  const tabRefs = useRef<Partial<Record<TabType, HTMLButtonElement | null>>>({});
  const TAB_CONFIG = [
    { id: "map" as const, label: t("map"), icon: TAB_ICONS.map },
    { id: "chart" as const, label: t("chart"), icon: TAB_ICONS.chart },
    { id: "list" as const, label: t("list"), icon: TAB_ICONS.list },
  ] as const;

  const registerTab = useCallback((tab: TabType, element: HTMLButtonElement | null) => {
    tabRefs.current[tab] = element;
  }, []);

  // Roving focus: arrow/Home/End select the target tab and move focus onto it.
  const handleNavigate = (event: React.KeyboardEvent<HTMLButtonElement>, tab: TabType) => {
    const target = tabForKey(event.key, tab);
    if (!target) return;
    event.preventDefault();
    if (target !== activeTab) onTabChange(target);
    tabRefs.current[target]?.focus();
  };

  const contentMap: Record<TabType, ReactNode> = { map: mapContent, chart: chartContent, list: listContent };

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col">
      {/* Active tab panel — only the selected tab is mounted */}
      <div className="relative flex-1 overflow-hidden">
        <div
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className={cn("absolute inset-0", activeTab !== "map" && "overflow-y-auto")}
        >
          {contentMap[activeTab]}
        </div>
      </div>

      {/* Tab bar - sticky at bottom for thumb reach */}
      <div className="bg-background/95 sticky bottom-0 z-10 border-t backdrop-blur-sm">
        <div className="flex" role="tablist" aria-label={t("viewOptions")}>
          {TAB_CONFIG.map(({ id, label, icon }) => (
            <TabButton
              key={id}
              id={id}
              label={label}
              icon={icon}
              isActive={activeTab === id}
              onSelect={onTabChange}
              onNavigate={handleNavigate}
              buttonRef={registerTab}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

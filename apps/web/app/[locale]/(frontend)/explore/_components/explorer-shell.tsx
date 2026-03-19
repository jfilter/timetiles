/**
 * Shared shell for map and list explorer layouts.
 *
 * Calls {@link useExplorerState} and renders the outermost viewport
 * container and the event detail modal that both {@link MapExplorer}
 * and {@link ListExplorer} use identically. Also provides pre-built
 * filter chrome elements (`filterPanel` and `mobileFilters`) so each
 * explorer can place them in the correct position within its own
 * layout without importing or wiring the underlying components.
 *
 * @module
 * @category Components
 */
"use client";

import { cn } from "@timetiles/ui/lib/utils";
import type { ReactNode } from "react";

import { ExplorerEventModal, ExplorerFilterPanel, ExplorerMobileFilters } from "./explorer-chrome";
import type { UseExplorerStateOptions } from "./use-explorer-state";
import { useExplorerState } from "./use-explorer-state";

/** The full return type of {@link useExplorerState}. */
export type ExplorerState = ReturnType<typeof useExplorerState>;

/** Pre-built chrome elements provided to the render prop. */
export interface ExplorerChromeElements {
  /** Full explorer state (map, filters, selection, data, ui, scope) */
  explorer: ExplorerState;
  /** Desktop filter panel — call with an optional className and place inside the desktop layout */
  filterPanel: (className?: string) => ReactNode;
  /** Mobile filter bottom sheet — place inside the mobile layout */
  mobileFilters: ReactNode;
}

interface ExplorerShellProps {
  /** Options forwarded to {@link useExplorerState} (e.g. onMapPositionChange) */
  explorerOptions?: UseExplorerStateOptions;
  /** Additional className for the outermost container */
  className?: string;
  /** Render prop receiving explorer state and pre-built chrome elements for layout placement */
  children: (chrome: ExplorerChromeElements) => ReactNode;
}

/**
 * Wraps explorer layouts with the shared viewport container and chrome.
 *
 * Internally calls {@link useExplorerState} so individual explorers
 * don't need to. The outer `div` and the `ExplorerEventModal` are
 * rendered by the shell. Filter chrome and the full explorer state are
 * provided via the render prop so each explorer can position them
 * within its own desktop/mobile markup.
 */
export const ExplorerShell = ({ explorerOptions, className, children }: Readonly<ExplorerShellProps>) => {
  const explorer = useExplorerState(explorerOptions);
  const { selection, filters: filterState, ui } = explorer;

  const filterPanel = (filterClassName?: string) => (
    <ExplorerFilterPanel isOpen={ui.isFilterDrawerOpen} className={filterClassName} />
  );

  const mobileFilters = (
    <ExplorerMobileFilters
      isOpen={ui.isFilterDrawerOpen}
      onToggle={ui.toggleFilterDrawer}
      activeFilterCount={filterState.activeFilterCount}
    />
  );

  return (
    <div className={cn("flex h-[calc(100dvh-3rem)] flex-col", className)}>
      {children({ explorer, filterPanel, mobileFilters })}

      {/* Event Detail Modal — shared across all layouts */}
      <ExplorerEventModal selectedEventId={selection.selectedEventId} onClose={selection.closeEvent} />
    </div>
  );
};

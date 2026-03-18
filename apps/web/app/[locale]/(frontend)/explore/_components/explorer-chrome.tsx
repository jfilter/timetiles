/**
 * Shared chrome components for map and list explorer layouts.
 *
 * Extracts the repeated overlay/panel elements (event detail modal,
 * filter panel, mobile filter sheet) that both MapExplorer and
 * ListExplorer render identically. Each explorer provides its own
 * layout-specific content and passes filter/selection state here.
 *
 * @module
 * @category Components
 */
"use client";

import { EventDetailModal } from "./event-detail-modal";
import { FilterDrawer } from "./filter-drawer";
import { FilterPanel } from "./filter-panel";
import { MobileFilterSheet } from "./mobile-filter-sheet";

interface ExplorerFilterPanelProps {
  isOpen: boolean;
  /** Additional className for the FilterPanel (e.g., "self-start" or "h-full overflow-hidden") */
  className?: string;
}

/**
 * Desktop filter panel with drawer content.
 * Renders the sliding filter panel used in both explorer layouts.
 */
export const ExplorerFilterPanel = ({ isOpen, className }: Readonly<ExplorerFilterPanelProps>) => (
  <FilterPanel isOpen={isOpen} className={className}>
    <FilterDrawer />
  </FilterPanel>
);

interface ExplorerMobileFiltersProps {
  isOpen: boolean;
  onToggle: () => void;
  activeFilterCount: number;
}

/**
 * Mobile filter bottom sheet with drawer content.
 * Renders the overlay filter sheet used in both explorer layouts.
 */
export const ExplorerMobileFilters = ({
  isOpen,
  onToggle,
  activeFilterCount,
}: Readonly<ExplorerMobileFiltersProps>) => (
  <MobileFilterSheet isOpen={isOpen} onClose={onToggle} onOpen={onToggle} activeFilterCount={activeFilterCount}>
    <FilterDrawer />
  </MobileFilterSheet>
);

interface ExplorerEventModalProps {
  selectedEventId: number | null;
  onClose: () => void;
}

/**
 * Event detail modal overlay.
 * Renders the event detail modal used in both explorer layouts.
 */
export const ExplorerEventModal = ({ selectedEventId, onClose }: Readonly<ExplorerEventModalProps>) => (
  <EventDetailModal eventId={selectedEventId} onClose={onClose} />
);

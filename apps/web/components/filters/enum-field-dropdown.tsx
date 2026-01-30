/**
 * Multi-select dropdown for filtering by enum field values.
 *
 * Displays a dropdown menu with checkboxes for each enum value,
 * allowing users to filter events by selecting multiple values.
 * Shows selected count and value counts/percentages.
 *
 * @module
 * @category Components
 */
"use client";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@timetiles/ui/components/dropdown-menu";
import { cn } from "@timetiles/ui/lib/utils";
import { ChevronDown, X } from "lucide-react";
import { memo, useCallback } from "react";

interface EnumValue {
  value: string;
  count: number;
  percent: number;
}

interface EnumFieldDropdownProps {
  /** Field path in the data */
  fieldPath: string;
  /** Human-readable label for the field */
  label: string;
  /** Available enum values with counts */
  values: EnumValue[];
  /** Currently selected values */
  selectedValues: string[];
  /** Callback when selection changes */
  onSelectionChange: (values: string[]) => void;
}

interface EnumCheckboxItemProps {
  value: string;
  count: number;
  percent: number;
  checked: boolean;
  onToggle: (value: string) => void;
  onPreventSelect: (e: Event) => void;
}

/**
 * Memoized checkbox item for enum value selection.
 */
const EnumCheckboxItem = memo(
  ({ value, count, percent, checked, onToggle, onPreventSelect }: EnumCheckboxItemProps) => {
    const handleCheckedChange = useCallback(() => {
      onToggle(value);
    }, [onToggle, value]);

    return (
      <DropdownMenuCheckboxItem checked={checked} onCheckedChange={handleCheckedChange} onSelect={onPreventSelect}>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate">{value}</span>
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            {count.toLocaleString()} ({Math.round(percent)}%)
          </span>
        </div>
      </DropdownMenuCheckboxItem>
    );
  }
);
EnumCheckboxItem.displayName = "EnumCheckboxItem";

/**
 * Multi-select dropdown for a single enum field.
 *
 * Uses Radix DropdownMenu with checkbox items for multi-select.
 * Shows value counts and allows clearing all selections.
 */
export const EnumFieldDropdown = ({
  fieldPath: _fieldPath,
  label,
  values,
  selectedValues,
  onSelectionChange,
}: EnumFieldDropdownProps) => {
  const hasSelection = selectedValues.length > 0;

  const handleToggle = useCallback(
    (value: string) => {
      if (selectedValues.includes(value)) {
        onSelectionChange(selectedValues.filter((v) => v !== value));
      } else {
        onSelectionChange([...selectedValues, value]);
      }
    },
    [selectedValues, onSelectionChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onSelectionChange([]);
    },
    [onSelectionChange]
  );

  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  const handlePreventSelect = useCallback((e: Event) => {
    e.preventDefault();
  }, []);

  // Limit display to top 15 values by count
  const displayValues = values.slice(0, 15);

  return (
    <div className="space-y-1">
      <div className="text-cartographic-navy/60 dark:text-cartographic-charcoal/60 font-mono text-xs tracking-wider uppercase">
        {label}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
              "bg-background hover:bg-accent",
              hasSelection ? "border-cartographic-blue/30 text-foreground" : "border-input text-muted-foreground"
            )}
          >
            <span className="truncate">{hasSelection ? `${selectedValues.length} selected` : "Any"}</span>
            <div className="flex items-center gap-1">
              {hasSelection && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="hover:bg-muted rounded p-0.5"
                  aria-label={`Clear ${label} filter`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" aria-hidden="true" />
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[300px] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
        >
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>{label}</span>
            {hasSelection && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-cartographic-terracotta text-xs hover:underline"
              >
                Clear
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {displayValues.map(({ value, count, percent }) => (
            <EnumCheckboxItem
              key={value}
              value={value}
              count={count}
              percent={percent}
              checked={selectedValues.includes(value)}
              onToggle={handleToggle}
              onPreventSelect={handlePreventSelect}
            />
          ))}
          {values.length > displayValues.length && (
            <>
              <DropdownMenuSeparator />
              <div className="text-muted-foreground px-2 py-1 text-center text-xs">
                {values.length - displayValues.length} more values not shown
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

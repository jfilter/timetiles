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
import { ChevronDown, X } from "lucide-react";

import { cn } from "@timetiles/ui/lib/utils";

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

/**
 * Multi-select dropdown for a single enum field.
 *
 * Uses Radix DropdownMenu with checkbox items for multi-select.
 * Shows value counts and allows clearing all selections.
 */
export const EnumFieldDropdown = ({
  fieldPath,
  label,
  values,
  selectedValues,
  onSelectionChange,
}: EnumFieldDropdownProps) => {
  const hasSelection = selectedValues.length > 0;

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter((v) => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelectionChange([]);
  };

  // Limit display to top 15 values by count
  const displayValues = values.slice(0, 15);

  return (
    <div className="space-y-1">
      <div className="text-cartographic-navy/60 dark:text-cartographic-charcoal/60 font-mono text-xs uppercase tracking-wider">
        {label}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
              "bg-background hover:bg-accent",
              hasSelection
                ? "border-cartographic-blue/30 text-foreground"
                : "border-input text-muted-foreground"
            )}
          >
            <span className="truncate">
              {hasSelection ? `${selectedValues.length} selected` : "Any"}
            </span>
            <div className="flex items-center gap-1">
              {hasSelection && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleClear(e as unknown as React.MouseEvent);
                    }
                  }}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
              <ChevronDown className="h-4 w-4 opacity-50" />
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
                onClick={() => onSelectionChange([])}
                className="text-cartographic-terracotta text-xs hover:underline"
              >
                Clear
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {displayValues.map(({ value, count, percent }) => (
            <DropdownMenuCheckboxItem
              key={value}
              checked={selectedValues.includes(value)}
              onCheckedChange={() => handleToggle(value)}
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="truncate">{value}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {count.toLocaleString()} ({Math.round(percent)}%)
                </span>
              </div>
            </DropdownMenuCheckboxItem>
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

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
import { useTranslations } from "next-intl";

interface EnumValue {
  value: string;
  count: number;
  percent: number;
}

interface EnumFieldDropdownProps {
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
 * Checkbox item for enum value selection.
 */
const EnumCheckboxItem = ({ value, count, percent, checked, onToggle, onPreventSelect }: EnumCheckboxItemProps) => {
  const handleCheckedChange = () => {
    onToggle(value);
  };

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
};

/**
 * Multi-select dropdown for a single enum field.
 *
 * Uses Radix DropdownMenu with checkbox items for multi-select.
 * Shows value counts and allows clearing all selections.
 */
export const EnumFieldDropdown = ({ label, values, selectedValues, onSelectionChange }: EnumFieldDropdownProps) => {
  const t = useTranslations("Common");
  const tFilters = useTranslations("Filters");
  const hasSelection = selectedValues.length > 0;

  const handleToggle = (value: string) => {
    if (selectedValues.includes(value)) {
      onSelectionChange(selectedValues.filter((v) => v !== value));
    } else {
      onSelectionChange([...selectedValues, value]);
    }
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    onSelectionChange([]);
  };

  const handlePreventSelect = (e: Event) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-1">
      <div className="text-muted-foreground dark:text-foreground/60 font-mono text-xs tracking-wider uppercase">
        {label}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm border px-3 py-2 text-sm transition-colors",
              "bg-background hover:bg-accent",
              hasSelection ? "border-ring/30 text-foreground" : "border-input text-muted-foreground"
            )}
          >
            <span className="truncate">
              {hasSelection ? t("selected", { count: selectedValues.length }) : t("any")}
            </span>
            <div className="flex items-center gap-1">
              {hasSelection && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="hover:bg-muted rounded p-0.5"
                  aria-label={tFilters("clearFieldFilter", { label })}
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
              <button type="button" onClick={handleClear} className="text-secondary text-xs hover:underline">
                {t("clear")}
              </button>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {values.map(({ value, count, percent }) => (
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

/**
 * Mutually exclusive toggle button group.
 *
 * Renders a row of buttons where exactly one is active at a time.
 * Used for preset selections like cluster density (Fine/Normal/Coarse).
 *
 * @module
 * @category Components
 */
import { cn } from "../lib/utils";

export interface PresetOption<T extends string> {
  key: T;
  label: string;
}

export interface PresetButtonGroupProps<T extends string> {
  options: PresetOption<T>[];
  value: string;
  onChange: (value: T) => void;
  className?: string;
}

export const PresetButtonGroup = <T extends string>({
  options,
  value,
  onChange,
  className,
}: PresetButtonGroupProps<T>) => (
  <div className={cn("flex gap-1", className)}>
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        onClick={() => onChange(option.key)}
        className={cn(
          "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
          value === option.key
            ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

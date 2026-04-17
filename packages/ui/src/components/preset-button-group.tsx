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
          "border-border ring-ring/40 flex-1 rounded-sm border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
          value === option.key
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        )}
      >
        {option.label}
      </button>
    ))}
  </div>
);

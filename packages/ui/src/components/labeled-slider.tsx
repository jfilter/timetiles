/**
 * Range input with label, value display, and min/max hint labels.
 *
 * Compact slider control for numeric settings in map control panels.
 *
 * @module
 * @category Components
 */

export interface LabeledSliderProps {
  /** Label displayed above the slider. */
  label: string;
  /** Current value. */
  value: number;
  /** Called when value changes. */
  onChange: (value: number) => void;
  /** Minimum value. */
  min: number;
  /** Maximum value. */
  max: number;
  /** Step increment. @default 1 */
  step?: number;
  /** Hint label for minimum end. */
  minLabel?: string;
  /** Hint label for maximum end. */
  maxLabel?: string;
  /** Format the displayed value. @default String */
  formatValue?: (value: number) => string;
}

export const LabeledSlider = ({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  minLabel,
  maxLabel,
  formatValue = String,
}: LabeledSliderProps) => (
  <div>
    <div className="flex items-center justify-between">
      <label className="text-muted-foreground text-xs font-medium">{label}</label>
      <span className="text-foreground text-xs tabular-nums">{formatValue(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="accent-primary h-1 w-full cursor-pointer"
    />
    {(minLabel ?? maxLabel) && (
      <div className="text-muted-foreground/80 flex justify-between text-[10px]">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    )}
  </div>
);

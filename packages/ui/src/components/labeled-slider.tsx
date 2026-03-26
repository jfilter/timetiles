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
      <label className="text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <span className="text-xs text-gray-700 tabular-nums dark:text-gray-300">{formatValue(value)}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1 w-full cursor-pointer accent-gray-900 dark:accent-gray-300"
    />
    {(minLabel ?? maxLabel) && (
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    )}
  </div>
);

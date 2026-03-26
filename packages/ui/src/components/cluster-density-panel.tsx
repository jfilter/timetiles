/**
 * Cluster density control panel — presentational component.
 *
 * Provides preset buttons (Fine/Normal/Coarse), an expert toggle,
 * and sliders for base radius and zoom factor. All state is managed
 * via props — no app-specific dependencies.
 *
 * @module
 * @category Components
 */
import { Layers } from "lucide-react";
import { useState } from "react";

import { cn } from "../lib/utils";

/** Density mode: preset name or expert. */
export type ClusterDensityMode = "fine" | "normal" | "coarse" | "expert";

/** Cluster density values. */
export interface ClusterDensityValues {
  clusterRadius?: number;
  clusterZoomFactor?: number;
}

/** Preset definition with label and values. */
export interface ClusterDensityPreset {
  key: Exclude<ClusterDensityMode, "expert">;
  label: string;
}

export interface ClusterDensityPanelProps {
  /** Current density mode. */
  mode: ClusterDensityMode;
  /** Current density values. */
  values: ClusterDensityValues;
  /** Called when a preset or expert mode is selected. */
  onModeChange: (mode: ClusterDensityMode) => void;
  /** Called when expert slider values change. */
  onValuesChange: (values: ClusterDensityValues) => void;

  /** Label for the panel title and button tooltip. */
  title?: string;
  /** Preset labels. */
  presets?: ClusterDensityPreset[];
  /** Expert button label. */
  expertLabel?: string;
  /** Labels for the radius slider. */
  radiusLabel?: string;
  radiusMinLabel?: string;
  radiusMaxLabel?: string;
  /** Labels for the zoom factor slider. */
  zoomFactorLabel?: string;
  zoomFactorMinLabel?: string;
  zoomFactorMaxLabel?: string;
}

const DEFAULT_PRESETS: ClusterDensityPreset[] = [
  { key: "fine", label: "Fine" },
  { key: "normal", label: "Normal" },
  { key: "coarse", label: "Coarse" },
];

const activeClass = "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900";
const inactiveClass =
  "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600";

export const ClusterDensityPanel = ({
  mode,
  values,
  onModeChange,
  onValuesChange,
  title = "Cluster density",
  presets = DEFAULT_PRESETS,
  expertLabel = "Expert",
  radiusLabel = "Base radius",
  radiusMinLabel = "More",
  radiusMaxLabel = "Fewer",
  zoomFactorLabel = "Zoom factor",
  zoomFactorMinLabel = "Stable",
  zoomFactorMaxLabel = "Adaptive",
}: ClusterDensityPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
        title={title}
        type="button"
      >
        <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
      </button>

      {isOpen && (
        <div className="absolute bottom-0 left-10 z-20 w-56 rounded border bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{title}</div>

          {/* Presets */}
          <div className="mb-2 flex gap-1">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => onModeChange(preset.key)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs font-medium transition-colors",
                  mode === preset.key ? activeClass : inactiveClass
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Expert toggle */}
          <button
            type="button"
            onClick={() => onModeChange(mode === "expert" ? "normal" : "expert")}
            className={cn(
              "mb-2 w-full rounded px-2 py-1 text-xs transition-colors",
              mode === "expert"
                ? activeClass
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            )}
          >
            {expertLabel}
          </button>

          {/* Expert sliders */}
          {mode === "expert" && (
            <div className="space-y-2 border-t pt-2 dark:border-gray-700">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{radiusLabel}</label>
                  <span className="text-xs text-gray-700 tabular-nums dark:text-gray-300">
                    {values.clusterRadius ?? 60}
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={values.clusterRadius ?? 60}
                  onChange={(e) => onValuesChange({ ...values, clusterRadius: Number(e.target.value) })}
                  className="h-1 w-full cursor-pointer accent-gray-900 dark:accent-gray-300"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{radiusMinLabel}</span>
                  <span>{radiusMaxLabel}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{zoomFactorLabel}</label>
                  <span className="text-xs text-gray-700 tabular-nums dark:text-gray-300">
                    {(values.clusterZoomFactor ?? 1.4).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={18}
                  step={1}
                  value={Math.round((values.clusterZoomFactor ?? 1.4) * 10)}
                  onChange={(e) => onValuesChange({ ...values, clusterZoomFactor: Number(e.target.value) / 10 })}
                  className="h-1 w-full cursor-pointer accent-gray-900 dark:accent-gray-300"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{zoomFactorMinLabel}</span>
                  <span>{zoomFactorMaxLabel}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

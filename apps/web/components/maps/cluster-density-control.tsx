/**
 * Cluster density map control.
 *
 * Uses generic UI building blocks (MapControlButton, MapControlPopover,
 * PresetButtonGroup, LabeledSlider) to compose a cluster density control
 * with presets and expert mode. Connects to Zustand store and i18n.
 *
 * @module
 * @category Components
 */
"use client";

import { LabeledSlider } from "@timetiles/ui/components/labeled-slider";
import { MapControlButton } from "@timetiles/ui/components/map-control-button";
import { MapControlPopover } from "@timetiles/ui/components/map-control-popover";
import { PresetButtonGroup } from "@timetiles/ui/components/preset-button-group";
import { cn } from "@timetiles/ui/lib/utils";
import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";

import { type ClusterDensityMode, useUIStore } from "@/lib/store";

const PRESET_KEYS: Exclude<ClusterDensityMode, "expert">[] = ["fine", "normal", "coarse"];

export const ClusterDensityControl = () => {
  const t = useTranslations("Explore");

  const mode = useUIStore((s) => s.ui.clusterDensityMode);
  const density = useUIStore((s) => s.ui.clusterDensity);
  const setMode = useUIStore((s) => s.setClusterDensityMode);
  const setDensity = useUIStore((s) => s.setClusterDensity);

  const presets = PRESET_KEYS.map((key) => ({ key, label: t(`clusterPreset_${key}`) }));

  const activeClass = "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900";

  return (
    <MapControlPopover
      trigger={
        <MapControlButton title={t("clusterDensity")}>
          <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </MapControlButton>
      }
    >
      <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("clusterDensity")}</div>

      <PresetButtonGroup options={presets} value={mode} onChange={(key) => setMode(key)} className="mb-2" />

      {/* Expert toggle */}
      <button
        type="button"
        onClick={() => setMode(mode === "expert" ? "normal" : "expert")}
        className={cn(
          "mb-2 w-full rounded px-2 py-1 text-xs transition-colors",
          mode === "expert"
            ? activeClass
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        )}
      >
        {t("clusterExpert")}
      </button>

      {/* Expert sliders */}
      {mode === "expert" && (
        <div className="space-y-2 border-t pt-2 dark:border-gray-700">
          <LabeledSlider
            label={t("clusterRadius")}
            value={density.clusterRadius ?? 60}
            onChange={(v) => setDensity({ ...density, clusterRadius: v })}
            min={20}
            max={200}
            step={5}
            minLabel={t("clusterMore")}
            maxLabel={t("clusterFewer")}
          />
          <LabeledSlider
            label={t("clusterZoomFactor")}
            value={Math.round((density.clusterZoomFactor ?? 1.4) * 10)}
            onChange={(v) => setDensity({ ...density, clusterZoomFactor: v / 10 })}
            min={10}
            max={18}
            step={1}
            minLabel={t("clusterStable")}
            maxLabel={t("clusterAdaptive")}
            formatValue={(v) => (v / 10).toFixed(1)}
          />
        </div>
      )}
    </MapControlPopover>
  );
};

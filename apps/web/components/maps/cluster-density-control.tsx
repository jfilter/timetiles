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

import { useFeatureEnabled } from "@/lib/hooks/use-feature-flags";
import { type ClusterAlgorithm, type ClusterDensityMode, type ClusterDisplay, useUIStore } from "@/lib/store";

const PRESET_KEYS: Exclude<ClusterDensityMode, "expert">[] = ["fine", "normal", "coarse"];
const ALGORITHM_KEYS: ClusterAlgorithm[] = ["h3", "grid-k", "dbscan"];
const DISPLAY_KEYS: ClusterDisplay[] = ["circles", "hexagons"];

export const ClusterDensityControl = () => {
  const t = useTranslations("Explore");
  const { isEnabled: expertEnabled } = useFeatureEnabled("enableExpertMode");

  const algorithm = useUIStore((s) => s.ui.clusterAlgorithm);
  const mode = useUIStore((s) => s.ui.clusterDensityMode);
  const density = useUIStore((s) => s.ui.clusterDensity);
  const setAlgorithm = useUIStore((s) => s.setClusterAlgorithm);
  const setMode = useUIStore((s) => s.setClusterDensityMode);
  const setDensity = useUIStore((s) => s.setClusterDensity);

  const presets = PRESET_KEYS.map((key) => ({ key, label: t(`clusterPreset_${key}`) }));
  const algorithms = ALGORITHM_KEYS.map((key) => ({ key, label: t(`clusterAlgorithm_${key}`) }));

  const activeClass = "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900";

  // No expert mode: just show the layers icon (H3 is always active)
  if (!expertEnabled) {
    return (
      <MapControlButton title={t("clusterDensity")}>
        <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
      </MapControlButton>
    );
  }

  return (
    <MapControlPopover
      trigger={
        <MapControlButton title={t("clusterDensity")}>
          <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </MapControlButton>
      }
    >
      {/* Algorithm toggle */}
      <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("clusterAlgorithm")}</div>
      <PresetButtonGroup
        options={algorithms}
        value={algorithm}
        onChange={(key) => setAlgorithm(key)}
        className="mb-3"
      />

      {/* Density presets (Grid-K and DBSCAN only) */}
      {algorithm !== "h3" && (
        <>
          <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("clusterDensity")}</div>
          <PresetButtonGroup options={presets} value={mode} onChange={(key) => setMode(key)} className="mb-2" />
        </>
      )}

      {/* H3 options */}
      {algorithm === "h3" && (
        <div className="mb-2 space-y-2">
          {/* Display mode: circles vs hexagons */}
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">{t("clusterDisplayMode")}</div>
            <PresetButtonGroup
              options={DISPLAY_KEYS.map((key) => ({ key, label: t(`clusterDisplay_${key}`) }))}
              value={useUIStore.getState().ui.clusterDisplay}
              onChange={(key) => {
                useUIStore.getState().setClusterDisplay(key);
                if (key === "hexagons") setDensity({ ...density, mergeOverlapping: false });
              }}
            />
          </div>
          {useUIStore.getState().ui.clusterDisplay === "circles" && (
            <div className="space-y-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={density.useHexCenter ?? false}
                  onChange={(e) => setDensity({ ...density, useHexCenter: e.target.checked })}
                  className="rounded"
                />
                {t("useHexCenter")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={useUIStore.getState().ui.showHexBoundaries}
                  onChange={(e) => useUIStore.getState().setShowHexBoundaries(e.target.checked)}
                  className="rounded"
                />
                {t("showHexBoundaries")}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={useUIStore.getState().ui.mergeOverlapping}
                  onChange={(e) => {
                    useUIStore.getState().setMergeOverlapping(e.target.checked);
                    setDensity({ ...density, mergeOverlapping: e.target.checked });
                  }}
                  className="rounded"
                />
                {t("mergeOverlapping")}
              </label>
            </div>
          )}
        </div>
      )}

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
          {algorithm === "h3" && (
            <LabeledSlider
              label={t("h3ResolutionScale")}
              value={density.h3ResolutionScale ?? 0.6}
              onChange={(v) => setDensity({ ...density, h3ResolutionScale: Math.round(v * 100) / 100 })}
              min={0.3}
              max={1.2}
              step={0.05}
              minLabel={t("h3Coarser")}
              maxLabel={t("h3Finer")}
            />
          )}
          {algorithm !== "h3" && (
            <LabeledSlider
              label={t("clusterResolution")}
              value={density.targetClusters ?? 60}
              onChange={(v) => setDensity({ ...density, targetClusters: v })}
              min={5}
              max={500}
              step={5}
              minLabel={t("clusterFewer")}
              maxLabel={t("clusterMore")}
            />
          )}
          {algorithm === "dbscan" && (
            <LabeledSlider
              label={t("clusterMinPoints")}
              value={density.minPoints ?? 2}
              onChange={(v) => setDensity({ ...density, minPoints: v })}
              min={2}
              max={20}
              step={1}
              minLabel={t("clusterMoreClusters")}
              maxLabel={t("clusterFewerClusters")}
            />
          )}
        </div>
      )}
    </MapControlPopover>
  );
};

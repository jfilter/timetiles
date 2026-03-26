"use client";

import { Layers } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { type ClusterDensityMode, useUIStore } from "@/lib/store";

const PRESET_KEYS = ["fine", "normal", "coarse"] as const;

export const ClusterDensityControl = () => {
  const t = useTranslations("Explore");
  const [isOpen, setIsOpen] = useState(false);

  const mode = useUIStore((s) => s.ui.clusterDensityMode);
  const density = useUIStore((s) => s.ui.clusterDensity);
  const setMode = useUIStore((s) => s.setClusterDensityMode);
  const setDensity = useUIStore((s) => s.setClusterDensity);

  const handlePreset = useCallback(
    (preset: Exclude<ClusterDensityMode, "expert">) => {
      setMode(preset);
    },
    [setMode]
  );

  const handleExpertToggle = useCallback(() => {
    setMode(mode === "expert" ? "normal" : "expert");
  }, [mode, setMode]);

  const handleRadiusChange = useCallback(
    (value: number) => {
      setDensity({ ...density, clusterRadius: value });
    },
    [density, setDensity]
  );

  const handleFactorChange = useCallback(
    (value: number) => {
      setDensity({ ...density, clusterZoomFactor: value });
    },
    [density, setDensity]
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-[29px] w-[29px] items-center justify-center rounded bg-white shadow-md transition-colors hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700"
        title={t("clusterDensity")}
        type="button"
      >
        <Layers className="h-4 w-4 text-gray-600 dark:text-gray-300" />
      </button>

      {isOpen && (
        <div className="absolute bottom-0 left-10 z-20 w-56 rounded border bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">{t("clusterDensity")}</div>

          {/* Presets */}
          <div className="mb-2 flex gap-1">
            {PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePreset(key)}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mode === key
                    ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                }`}
              >
                {t(`clusterPreset_${key}`)}
              </button>
            ))}
          </div>

          {/* Expert toggle */}
          <button
            type="button"
            onClick={handleExpertToggle}
            className={`mb-2 w-full rounded px-2 py-1 text-xs transition-colors ${
              mode === "expert"
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {t("clusterExpert")}
          </button>

          {/* Expert sliders */}
          {mode === "expert" && (
            <div className="space-y-2 border-t pt-2 dark:border-gray-700">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t("clusterRadius")}</label>
                  <span className="text-xs text-gray-700 tabular-nums dark:text-gray-300">
                    {density.clusterRadius ?? 60}
                  </span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={density.clusterRadius ?? 60}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="h-1 w-full cursor-pointer accent-gray-900 dark:accent-gray-300"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{t("clusterMore")}</span>
                  <span>{t("clusterFewer")}</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t("clusterZoomFactor")}</label>
                  <span className="text-xs text-gray-700 tabular-nums dark:text-gray-300">
                    {(density.clusterZoomFactor ?? 1.4).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={18}
                  step={1}
                  value={Math.round((density.clusterZoomFactor ?? 1.4) * 10)}
                  onChange={(e) => handleFactorChange(Number(e.target.value) / 10)}
                  className="h-1 w-full cursor-pointer accent-gray-900 dark:accent-gray-300"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>{t("clusterStable")}</span>
                  <span>{t("clusterAdaptive")}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Cluster density map control — connects the UI panel to app state.
 *
 * Thin wrapper around `ClusterDensityPanel` from the UI package,
 * wiring Zustand store state and next-intl translations.
 *
 * @module
 * @category Components
 */
"use client";

import { ClusterDensityPanel, type ClusterDensityMode } from "@timetiles/ui/components/cluster-density-panel";
import { useTranslations } from "next-intl";

import { useUIStore } from "@/lib/store";

export const ClusterDensityControl = () => {
  const t = useTranslations("Explore");

  const mode = useUIStore((s) => s.ui.clusterDensityMode);
  const density = useUIStore((s) => s.ui.clusterDensity);
  const setMode = useUIStore((s) => s.setClusterDensityMode);
  const setDensity = useUIStore((s) => s.setClusterDensity);

  return (
    <ClusterDensityPanel
      mode={mode}
      values={density}
      onModeChange={(m: ClusterDensityMode) => setMode(m)}
      onValuesChange={setDensity}
      title={t("clusterDensity")}
      presets={[
        { key: "fine", label: t("clusterPreset_fine") },
        { key: "normal", label: t("clusterPreset_normal") },
        { key: "coarse", label: t("clusterPreset_coarse") },
      ]}
      expertLabel={t("clusterExpert")}
      radiusLabel={t("clusterRadius")}
      radiusMinLabel={t("clusterMore")}
      radiusMaxLabel={t("clusterFewer")}
      zoomFactorLabel={t("clusterZoomFactor")}
      zoomFactorMinLabel={t("clusterStable")}
      zoomFactorMaxLabel={t("clusterAdaptive")}
    />
  );
};

/**
 * Dataset badge color palette for consistent dataset identification across the UI.
 *
 * Uses cartographic design system colors. Colors are assigned by dataset ID
 * so the first datasets always get the same colors.
 *
 * @module
 * @category Constants
 */

/** Structured color definitions for dataset badges */
export const DATASET_BADGE_COLORS = [
  { bg: "bg-cartographic-blue/10", text: "text-cartographic-blue", border: "border-cartographic-blue/30" },
  {
    bg: "bg-cartographic-terracotta/10",
    text: "text-cartographic-terracotta",
    border: "border-cartographic-terracotta/30",
  },
  { bg: "bg-cartographic-forest/10", text: "text-cartographic-forest", border: "border-cartographic-forest/30" },
  { bg: "bg-cartographic-teal/10", text: "text-cartographic-teal", border: "border-cartographic-teal/30" },
  { bg: "bg-cartographic-amber/10", text: "text-cartographic-amber", border: "border-cartographic-amber/30" },
  { bg: "bg-cartographic-plum/10", text: "text-cartographic-plum", border: "border-cartographic-plum/30" },
  { bg: "bg-cartographic-rose/10", text: "text-cartographic-rose", border: "border-cartographic-rose/30" },
  { bg: "bg-cartographic-olive/10", text: "text-cartographic-olive", border: "border-cartographic-olive/30" },
  { bg: "bg-cartographic-navy/10", text: "text-cartographic-navy", border: "border-cartographic-navy/30" },
  { bg: "bg-cartographic-slate/10", text: "text-cartographic-slate", border: "border-cartographic-slate/30" },
] as const;

export type DatasetBadgeColor = (typeof DATASET_BADGE_COLORS)[number];

/** Get structured color object for a dataset (bg, text, border classes) */
export const getDatasetColors = (datasetId: number): DatasetBadgeColor => {
  const index = (datasetId - 1) % DATASET_BADGE_COLORS.length;
  return DATASET_BADGE_COLORS[index]!;
};

/** Get combined badge class string for a dataset (bg + text) */
export const getDatasetBadgeClass = (datasetId: number | null): string => {
  const index = datasetId === null ? 0 : (datasetId - 1) % DATASET_BADGE_COLORS.length;
  const colors = DATASET_BADGE_COLORS[index] ?? DATASET_BADGE_COLORS[0];
  return `${colors.bg} ${colors.text}`;
};

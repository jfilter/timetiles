/**
 * Dataset badge color palette for consistent dataset identification across the UI.
 *
 * Uses semantic palette tokens so colors adapt to the active theme.
 * Colors are assigned by dataset ID so the first datasets always get the same colors.
 *
 * @module
 * @category Constants
 */

/** Structured color definitions for dataset badges */
export const DATASET_BADGE_COLORS = [
  {
    bg: "bg-palette-1/10",
    text: "text-palette-1",
    border: "border-palette-1/30",
    checkedBg: "data-[state=checked]:bg-palette-1",
  },
  {
    bg: "bg-palette-2/10",
    text: "text-palette-2",
    border: "border-palette-2/30",
    checkedBg: "data-[state=checked]:bg-palette-2",
  },
  {
    bg: "bg-palette-3/10",
    text: "text-palette-3",
    border: "border-palette-3/30",
    checkedBg: "data-[state=checked]:bg-palette-3",
  },
  {
    bg: "bg-palette-4/10",
    text: "text-palette-4",
    border: "border-palette-4/30",
    checkedBg: "data-[state=checked]:bg-palette-4",
  },
  {
    bg: "bg-palette-5/10",
    text: "text-palette-5",
    border: "border-palette-5/30",
    checkedBg: "data-[state=checked]:bg-palette-5",
  },
  {
    bg: "bg-palette-6/10",
    text: "text-palette-6",
    border: "border-palette-6/30",
    checkedBg: "data-[state=checked]:bg-palette-6",
  },
  {
    bg: "bg-palette-7/10",
    text: "text-palette-7",
    border: "border-palette-7/30",
    checkedBg: "data-[state=checked]:bg-palette-7",
  },
  {
    bg: "bg-palette-8/10",
    text: "text-palette-8",
    border: "border-palette-8/30",
    checkedBg: "data-[state=checked]:bg-palette-8",
  },
  {
    bg: "bg-palette-9/10",
    text: "text-palette-9",
    border: "border-palette-9/30",
    checkedBg: "data-[state=checked]:bg-palette-9",
  },
  {
    bg: "bg-palette-10/10",
    text: "text-palette-10",
    border: "border-palette-10/30",
    checkedBg: "data-[state=checked]:bg-palette-10",
  },
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

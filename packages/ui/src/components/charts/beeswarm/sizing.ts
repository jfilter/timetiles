/**
 * @module
 */

/** Adaptive dot size based on total point count */
export const computeDotSize = (totalPoints: number): number => {
  if (totalPoints < 50) return 14;
  if (totalPoints < 200) return 10;
  if (totalPoints < 500) return 8;
  if (totalPoints < 1000) return 6;
  return 4;
};

/** Logarithmic cluster sizing for better visual differentiation across magnitudes */
export const computeClusterSize = (count: number, maxCount: number, minSize = 10, maxSize = 40): number => {
  if (maxCount <= 1 || count <= 1) return minSize;
  const ratio = Math.log(count) / Math.log(maxCount);
  return Math.round(minSize + ratio * (maxSize - minSize));
};

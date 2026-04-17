/**
 * @module
 */

export { BeeswarmChart } from "./beeswarm-chart";
export { buildChartOption } from "./build-chart-option";
export {
  computeBeeswarmLayout,
  computeMergedLayoutConfig,
  computeRowLayoutConfig,
  computeXBounds,
} from "./layout-computation";
export { computeClusterSize, computeDotSize } from "./sizing";
export type { BeeswarmChartProps, BeeswarmDataItem, BeeswarmSeries, BeeswarmYAxisConfig } from "./types";

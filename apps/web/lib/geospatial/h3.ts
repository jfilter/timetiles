/**
 * H3 hexagonal-grid helpers.
 *
 * @module
 * @category Geospatial
 */
import { getResolution, isValidCell } from "h3-js";

export interface H3ClusterFilter {
  cells: string[];
  h3Resolution: number;
}

/**
 * Build a cluster filter from H3 cells. Returns undefined if the input is
 * empty or the first cell fails h3-js validation. Validation uses cells[0]
 * only — callers must ensure every cell in the list shares the same
 * resolution (the explore store only ever sets homogeneous cell lists).
 */
export const parseH3ClusterFilter = (cells: string[] | null | undefined): H3ClusterFilter | undefined => {
  if (!cells || cells.length === 0) return undefined;
  try {
    if (!isValidCell(cells[0]!)) return undefined;
    return { cells, h3Resolution: getResolution(cells[0]!) };
  } catch {
    return undefined;
  }
};

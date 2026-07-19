/**
 * Coordinate detection patterns for geospatial data.
 *
 * Re-exports pattern definitions from the schema detection plugin.
 * These patterns are used during schema detection and data import
 * to automatically recognize geographic fields.
 *
 * @module
 * @category Geospatial
 */

/*
 * Layer violation: geospatial/ is Layer 0 (foundation) and may not depend on lib/services/
 * (Layer 1 infrastructure). Pre-existing — eslint-plugin-boundaries 5 did not detect it,
 * boundaries 7 does. The real fix is to move these pure-data constants down into the
 * foundation layer and have schema-detection import them from here.
 * Tracked in https://github.com/jfilter/timetiles/issues/162
 */
/* eslint-disable boundaries/dependencies -- see above; the rule reports on the multi-line
   `from` clause, so a next-line directive would not cover it. */
export {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "@/lib/services/schema-detection";

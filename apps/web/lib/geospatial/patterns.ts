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

export {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "@timetiles/payload-schema-detection";

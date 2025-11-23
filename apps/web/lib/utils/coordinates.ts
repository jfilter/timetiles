/**
 * Coordinate formatting utilities for cartographic display.
 *
 * Provides functions to format geographic coordinates in various styles
 * appropriate for map interfaces and navigation displays.
 *
 * @module
 * @category Utils
 */

/**
 * Map bounds interface matching the Zustand store structure.
 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Calculate the center point of a bounding box.
 *
 * @param bounds - The map bounds
 * @returns Object with lat and lon of center point
 *
 * @example
 * ```ts
 * const center = getCenterFromBounds({
 *   north: 41.0,
 *   south: 40.0,
 *   east: -73.0,
 *   west: -74.0
 * });
 * // { lat: 40.5, lon: -73.5 }
 * ```
 */
export const getCenterFromBounds = (bounds: MapBounds): { lat: number; lon: number } => {
  return {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.east + bounds.west) / 2,
  };
};

/**
 * Format a coordinate value with hemisphere indicator.
 *
 * Converts decimal degrees to a formatted string with degree symbol
 * and hemisphere (N/S for latitude, E/W for longitude).
 *
 * @param value - The coordinate value in decimal degrees
 * @param isLatitude - True for latitude (N/S), false for longitude (E/W)
 * @param precision - Number of decimal places (default: 2)
 * @returns Formatted coordinate string
 *
 * @example
 * ```ts
 * formatCoordinate(40.7128, true);  // "40.71°N"
 * formatCoordinate(-74.0060, false); // "74.01°W"
 * formatCoordinate(51.5074, true, 4); // "51.5074°N"
 * ```
 */
export const formatCoordinate = (value: number, isLatitude: boolean, precision: number = 2): string => {
  const absValue = Math.abs(value);
  const rounded = absValue.toFixed(precision);

  let hemisphere: string;
  if (isLatitude) {
    hemisphere = value >= 0 ? "N" : "S";
  } else {
    hemisphere = value >= 0 ? "E" : "W";
  }

  return `${rounded}°${hemisphere}`;
};

/**
 * Format center coordinates from map bounds.
 *
 * Creates a compact, cartographic-style coordinate display showing
 * the center point of the current map view.
 *
 * @param bounds - The map bounds
 * @param precision - Number of decimal places (default: 2)
 * @returns Formatted coordinate pair string
 *
 * @example
 * ```ts
 * const bounds = {
 *   north: 41.0,
 *   south: 40.0,
 *   east: -73.0,
 *   west: -74.0
 * };
 * formatCenterCoordinates(bounds);
 * // "40.50°N 73.50°W"
 * ```
 */
export const formatCenterCoordinates = (bounds: MapBounds, precision: number = 2): string => {
  const center = getCenterFromBounds(bounds);
  const lat = formatCoordinate(center.lat, true, precision);
  const lon = formatCoordinate(center.lon, false, precision);

  return `${lat} ${lon}`;
};

/**
 * Format event count statistics.
 *
 * Creates a compact display of visible events vs total events.
 *
 * @param visible - Number of visible events
 * @param total - Total number of events
 * @returns Formatted count string or null if data is invalid
 *
 * @example
 * ```ts
 * formatEventCount(327, 1240);
 * // "327 / 1,240"
 *
 * formatEventCount(5, 5);
 * // "5 / 5"
 *
 * formatEventCount(undefined, undefined);
 * // null
 * ```
 */
export const formatEventCount = (visible: number | undefined, total: number | undefined): string | null => {
  if (visible == null || total == null || typeof visible !== "number" || typeof total !== "number") {
    return null;
  }
  const formattedTotal = total.toLocaleString("en-US");
  return `${visible} / ${formattedTotal}`;
};

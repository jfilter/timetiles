/**
 * Coordinate detection patterns for geospatial data.
 *
 * Pure pattern/bounds constants used during schema detection and data
 * import to automatically recognize geographic fields.
 *
 * @module
 * @category Geospatial
 */

/**
 * Latitude patterns for coordinate detection.
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LATITUDE_PATTERNS = [
  /^lat(itude)?$/i,
  /^lat[_\s.-]?deg(rees)?$/i,
  /^lat[_\s.-]?coord(inate)?$/i,
  /^y[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?lat(itude)?$/i,
  /^geo[_\s.-]?lat(itude)?$/i,
  /^decimal[_\s.-]?lat(itude)?$/i,
  /^latitude[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?lat(itude)?$/i,
  /^breite$/i, // German
  /^breitengrad$/i, // German
];

/**
 * Longitude patterns for coordinate detection.
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LONGITUDE_PATTERNS = [
  /^lon(g|gitude)?$/i,
  /^lng$/i,
  /^(lon(g)?|lng)[_\s.-]?deg(rees)?$/i,
  /^(lon(g)?|lng)[_\s.-]?coord(inate)?$/i,
  /^x[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^geo[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^decimal[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^(longitude|lng)[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?(lon(g|gitude)?|lng)$/i,
  /^länge$/i, // German
  /^laenge$/i, // German (ASCII)
  /^längengrad$/i, // German
];

/**
 * Combined coordinate patterns.
 *
 * Recognizes fields that contain both latitude and longitude in a single value.
 */
export const COMBINED_COORDINATE_PATTERNS = [
  /^coord(inate)?s?$/i,
  /^lat[_\s.-]?lon(g)?$/i,
  /^location$/i,
  /^geo[_\s.-]?location$/i,
  /^position$/i,
  /^point$/i,
  /^geometry$/i,
  /^geo$/i,
  /^geolocation$/i,
  /^geo[_\s.-]?point$/i,
  /^latlng$/i,
  /^lat[_\s.-]?lng$/i,
  /^lnglat$/i,
  /^lng[_\s.-]?lat$/i,
  /^koordinaten$/i, // German
];

/**
 * Valid coordinate bounds.
 */
export const COORDINATE_BOUNDS = { latitude: { min: -90, max: 90 }, longitude: { min: -180, max: 180 } };

/**
 * Address patterns for geocoding field detection.
 *
 * Matches fields that contain textual address information suitable for geocoding.
 */
export const ADDRESS_PATTERNS = [/^(address|addr|location|place|street|city|state|zip|postal|country)/i];

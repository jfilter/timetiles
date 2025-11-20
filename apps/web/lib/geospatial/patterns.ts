/**
 * Coordinate detection patterns for geospatial data.
 *
 * Contains pattern definitions for identifying latitude, longitude, and combined
 * coordinate fields in datasets. These patterns are used during schema detection
 * and data import to automatically recognize geographic fields.
 *
 * @module
 * @category Geospatial
 */

/**
 * Pattern matching for latitude field names.
 *
 * Recognizes common naming conventions for latitude columns including:
 * - Standard names: lat, latitude
 * - Degree notations: lat_deg, lat_degrees
 * - Coordinate notations: y_coord, y_coordinate
 * - Prefixed variations: location_lat, geo_lat, decimal_lat
 * - WGS84 notation: wgs84_lat
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LATITUDE_PATTERNS = [
  /^lat(itude)?$/i,
  /^lat[_\s.-]?deg(rees)?$/i,
  /^y[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?lat(itude)?$/i,
  /^geo[_\s.-]?lat(itude)?$/i,
  /^decimal[_\s.-]?lat(itude)?$/i,
  /^latitude[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?lat(itude)?$/i,
];

/**
 * Pattern matching for longitude field names.
 *
 * Recognizes common naming conventions for longitude columns including:
 * - Standard names: lon, long, longitude, lng
 * - Degree notations: lon_deg, long_degrees
 * - Coordinate notations: x_coord, x_coordinate
 * - Prefixed variations: location_lon, geo_lon, decimal_lon
 * - WGS84 notation: wgs84_lon
 *
 * Supports separators: underscore, space, hyphen, dot
 */
export const LONGITUDE_PATTERNS = [
  /^lon(g|gitude)?$/i,
  /^lng$/i,
  /^lon[_\s.-]?deg(rees)?$/i,
  /^long[_\s.-]?deg(rees)?$/i,
  /^x[_\s.-]?coord(inate)?$/i,
  /^location[_\s.-]?lon(g|gitude)?$/i,
  /^geo[_\s.-]?lon(g|gitude)?$/i,
  /^decimal[_\s.-]?lon(g|gitude)?$/i,
  /^longitude[_\s.-]?decimal$/i,
  /^wgs84[_\s.-]?lon(g|gitude)?$/i,
];

/**
 * Pattern matching for combined coordinate field names.
 *
 * Recognizes fields that contain both latitude and longitude in a single value.
 * Common formats include:
 * - Comma-separated: "40.7128, -74.0060"
 * - Space-separated: "40.7128 -74.0060"
 * - GeoJSON: {"type": "Point", "coordinates": [-74.0060, 40.7128]}
 *
 * Field name patterns include: coords, coordinates, lat_lon, location, position, point, geometry
 */
export const COMBINED_COORDINATE_PATTERNS = [
  /^coord(inate)?s$/i,
  /^lat[_\s.-]?lon(g)?$/i,
  /^location$/i,
  /^geo[_\s.-]?location$/i,
  /^position$/i,
  /^point$/i,
  /^geometry$/i,
  /^coordinates$/i,
];

/**
 * Pattern matching for address field names.
 *
 * Recognizes fields that contain textual address information suitable for geocoding.
 * Matches fields with names starting with: address, addr, location, place, street, city, state, zip, postal, country
 */
export const ADDRESS_PATTERNS = [/^(address|addr|location|place|street|city|state|zip|postal|country)/i];

/**
 * Valid coordinate bounds for validation.
 *
 * Defines the valid range for latitude (-90 to 90 degrees) and longitude (-180 to 180 degrees).
 * Used for validating detected coordinate values and filtering out invalid data.
 */
export const COORDINATE_BOUNDS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

import { METERS_PER_DEGREE_LAT } from './constants'

/**
 * Validate a coordinate pair
 * @param {number} lat
 * @param {number} lng
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCoordinate(lat, lng) {
  if (lat == null || lng == null) return { valid: false, error: 'Lat/lng is required' }
  if (typeof lat !== 'number' || typeof lng !== 'number') return { valid: false, error: 'Lat/lng must be numbers' }
  if (isNaN(lat) || isNaN(lng)) return { valid: false, error: 'Lat/lng must not be NaN' }
  if (lat < -90 || lat > 90) return { valid: false, error: `Lat ${lat} out of range [-90, 90]` }
  if (lng < -180 || lng > 180) return { valid: false, error: `Lng ${lng} out of range [-180, 180]` }
  return { valid: true }
}

/**
 * Validate a bounding box
 * @param {number} north
 * @param {number} south
 * @param {number} east
 * @param {number} west
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateBBox(north, south, east, west) {
  if (south > north) return { valid: false, error: 'South must be ≤ North' }
  if (west > east) return { valid: false, error: 'West must be ≤ East' }
  const n = validateCoordinate(north, east)
  if (!n.valid) return n
  const s = validateCoordinate(south, west)
  if (!s.valid) return s
  return { valid: true }
}

/**
 * Validate a zoom level
 * @param {number} zoom
 * @returns {boolean}
 */
export function isValidZoom(zoom) {
  return typeof zoom === 'number' && !isNaN(zoom) && zoom >= 0 && zoom <= 22
}

/**
 * Validate a UTM zone
 * @param {number} zone
 * @returns {boolean}
 */
export function isValidUTMZone(zone) {
  return Number.isInteger(zone) && zone >= 1 && zone <= 60
}

/**
 * Validate a bearing
 * @param {number} bearing - degrees
 * @returns {boolean}
 */
export function isValidBearing(bearing) {
  return typeof bearing === 'number' && !isNaN(bearing) && bearing >= 0 && bearing < 360
}

/**
 * Validate a distance (positive)
 * @param {number} distance - meters
 * @returns {boolean}
 */
export function isValidDistance(distance) {
  return typeof distance === 'number' && !isNaN(distance) && distance >= 0
}

/**
 * Clamp coordinate to valid range
 */
export function clampLat(lat) { return Math.max(-90, Math.min(90, lat)) }
export function clampLng(lng) { return Math.max(-180, Math.min(180, lng)) }
import { EARTH_RADIUS, DEG_TO_RAD, RAD_TO_DEG } from './constants'

/**
 * Haversine distance between two points (meters)
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in meters
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLng = (lng2 - lng1) * DEG_TO_RAD
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Bearing from point 1 to point 2 (degrees, 0-360)
 */
export function bearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * DEG_TO_RAD
  const y = Math.sin(dLng) * Math.cos(lat2 * DEG_TO_RAD)
  const x = Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
    Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLng)
  return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360
}

/**
 * Destination point given start, bearing, distance
 */
export function destinationPoint(lat, lng, bearingDeg, distanceMeters) {
  const brng = bearingDeg * DEG_TO_RAD
  const d = distanceMeters / EARTH_RADIUS
  const lat1 = lat * DEG_TO_RAD
  const lng1 = lng * DEG_TO_RAD

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng))
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  )

  return { lat: lat2 * RAD_TO_DEG, lng: lng2 * RAD_TO_DEG }
}

/**
 * Midpoint between two points
 */
export function midpoint(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * DEG_TO_RAD
  const φ1 = lat1 * DEG_TO_RAD, φ2 = lat2 * DEG_TO_RAD, λ1 = lng1 * DEG_TO_RAD
  const Bx = Math.cos(φ2) * Math.cos(dLng)
  const By = Math.cos(φ2) * Math.sin(dLng)
  return {
    lat: Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2)) * RAD_TO_DEG,
    lng: (λ1 + Math.atan2(By, Math.cos(φ1) + Bx)) * RAD_TO_DEG,
  }
}
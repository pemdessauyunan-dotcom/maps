import { METERS_PER_DEGREE_LAT, DEG_TO_RAD } from './constants'

/**
 * Grid generation and projection utilities
 */

/**
 * Generate a regular grid of points
 * @param {number} north - bounding box
 * @param {number} south
 * @param {number} east
 * @param {number} west
 * @param {number} rows - number of rows
 * @param {number} cols - number of columns
 * @returns {Array<{lat, lng}>}
 */
export function generateGrid(north, south, east, west, rows = 10, cols = 10) {
  const points = []
  const latStep = (north - south) / rows
  const lngStep = (east - west) / cols
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j <= cols; j++) {
      points.push({ lat: south + i * latStep, lng: west + j * lngStep })
    }
  }
  return points
}

/**
 * Generate a radial grid around a center point
 * @param {number} lat - center
 * @param {number} lng - center
 * @param {number} radiusMeters
 * @param {number} rings - number of concentric rings
 * @param {number} pointsPerRing - points per ring
 * @returns {Array<{lat, lng}>}
 */
export function generateRadialGrid(lat, lng, radiusMeters, rings = 5, pointsPerRing = 12) {
  const points = [{ lat, lng }] // center
  for (let r = 1; r <= rings; r++) {
    const ringRadius = (radiusMeters / rings) * r
    for (let p = 0; p < pointsPerRing; p++) {
      const angle = (360 / pointsPerRing) * p
      const dLat = (ringRadius / METERS_PER_DEGREE_LAT) * Math.cos(angle * DEG_TO_RAD)
      const dLng = (ringRadius / (METERS_PER_DEGREE_LAT * Math.cos(lat * DEG_TO_RAD))) * Math.sin(angle * DEG_TO_RAD)
      points.push({ lat: lat + dLat, lng: lng + dLng })
    }
  }
  return points
}

/**
 * Generate a transect line (cross-section) between two points
 * @param {number} lat1, lng1 - start
 * @param {number} lat2, lng2 - end
 * @param {number} steps - number of segments
 * @returns {Array<{lat, lng, t}>} t is normalized position [0, 1]
 */
export function generateTransect(lat1, lng1, lat2, lng2, steps = 50) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push({
      lat: lat1 + (lat2 - lat1) * t,
      lng: lng1 + (lng2 - lng1) * t,
      t,
    })
  }
  return points
}

/**
 * Get center of bounding box
 */
export function bboxCenter(north, south, east, west) {
  return { lat: (north + south) / 2, lng: (east + west) / 2 }
}

/**
 * Expand bounding box by a factor
 */
export function expandBBox(north, south, east, west, factor = 1.1) {
  const latCenter = (north + south) / 2
  const lngCenter = (east + west) / 2
  const latHalf = (north - south) / 2 * factor
  const lngHalf = (east - west) / 2 * factor
  return {
    north: latCenter + latHalf,
    south: latCenter - latHalf,
    east: lngCenter + lngHalf,
    west: lngCenter - lngHalf,
  }
}
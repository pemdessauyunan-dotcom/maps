import { EARTH_EQUATORIAL_RADIUS, EARTH_FLATTENING, ECCENTRICITY_SQ, DEG_TO_RAD, RAD_TO_DEG } from './constants'

/**
 * UTM Zone calculations
 * Pure functions for UTM coordinate conversion.
 */

/**
 * Get UTM zone number for a longitude
 * @param {number} lng
 * @returns {number} Zone 1-60
 */
export function getUTMZone(lng) {
  return Math.floor((lng + 180) / 6) + 1
}

/**
 * Get UTM zone letter for a latitude
 * @param {number} lat
 * @returns {string} Zone letter (C-X)
 */
export function getUTMZoneLetter(lat) {
  if (lat >= 84) return 'X'
  if (lat <= -80) return 'C'
  const bands = ['C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','X']
  const idx = Math.floor((lat + 80) / 8)
  return bands[Math.min(idx, bands.length - 1)]
}

/**
 * Get EPSG code for a UTM zone
 * @param {number} zone
 * @param {boolean} north - true for northern hemisphere
 * @returns {string} EPSG code
 */
export function getEPSGForUTM(zone, north) {
  return north ? `EPSG:326${String(zone).padStart(2, '0')}` : `EPSG:327${String(zone).padStart(2, '0')}`
}

/**
 * Convert WGS84 lat/lng to UTM (easting, northing)
 * Uses transverse Mercator projection
 * @param {number} lat
 * @param {number} lng
 * @returns {{ easting: number, northing: number, zone: number, zoneLetter: string, epsg: string }}
 */
export function wgs84ToUTM(lat, lng) {
  const zone = getUTMZone(lng)
  const zoneLetter = getUTMZoneLetter(lat)
  const centralMeridian = ((zone - 1) * 6 - 180 + 3) * DEG_TO_RAD
  const north = lat >= 0

  const φ = lat * DEG_TO_RAD
  const λ = (lng - ((zone - 1) * 6 - 180 + 3)) * DEG_TO_RAD

  const a = EARTH_EQUATORIAL_RADIUS
  const f = EARTH_FLATTENING
  const e = Math.sqrt(ECCENTRICITY_SQ)
  const e2 = ECCENTRICITY_SQ
  const e4 = e2 * e2
  const e6 = e4 * e2

  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2)
  const T = Math.tan(φ) ** 2
  const C = e2 * Math.cos(φ) ** 2 / (1 - e2)
  const A = λ * Math.cos(φ)

  const M = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * φ -
    (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * φ) +
    (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * φ) -
    (35 * e6 / 3072) * Math.sin(6 * φ)
  )

  const easting = 0.9996 * N * (
    A + (1 - T + C) * A ** 3 / 6 +
    (5 - 18 * T + T ** 2 + 72 * C - 58 * ECCENTRICITY_SQ) * A ** 5 / 120
  ) + 500000

  const northing = 0.9996 * (
    M + N * Math.tan(φ) * (
      A ** 2 / 2 +
      (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 +
      (61 - 58 * T + T ** 2 + 600 * C - 330 * ECCENTRICITY_SQ) * A ** 6 / 720
    )
  ) + (north ? 0 : 10000000)

  return {
    easting: Math.round(easting * 100) / 100,
    northing: Math.round(northing * 100) / 100,
    zone,
    zoneLetter,
    hemisphere: north ? 'N' : 'S',
    epsg: getEPSGForUTM(zone, north),
  }
}

/**
 * Detect EPSG code for a coordinate
 * @param {number} lat
 * @param {number} lng
 * @returns {string} EPSG code
 */
export function detectEPSG(lat, lng) {
  if (lat > 84 || lat < -80) return 'EPSG:4326' // Polar regions
  const zone = getUTMZone(lng)
  return getEPSGForUTM(zone, lat >= 0)
}
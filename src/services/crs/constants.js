// Earth constants for geodetic calculations
export const EARTH_RADIUS = 6371000 // meters (WGS84)
export const EARTH_EQUATORIAL_RADIUS = 6378137
export const EARTH_POLAR_RADIUS = 6356752
export const EARTH_FLATTENING = 1 / 298.257223563
export const ECCENTRICITY_SQ = 0.00669437999014
export const DEG_TO_RAD = Math.PI / 180
export const RAD_TO_DEG = 180 / Math.PI
export const METERS_PER_DEGREE = 111320 // approximate at equator
export const METERS_PER_DEGREE_LAT = 111320
export const METERS_PER_DEGREE_LNG = 111320 * Math.cos // (lng * DEG_TO_RAD) — computed at runtime

export const EPSG_CODES = {
  WGS84: 'EPSG:4326',
  WEB_MERCATOR: 'EPSG:3857',
  UTM_NORTH: 'EPSG:32600', // + zone
  UTM_SOUTH: 'EPSG:32700', // + zone
}

export const UTM_BANDS = [
  { min: -80, max: -72, band: 'C' }, { min: -72, max: -64, band: 'D' },
  { min: -64, max: -56, band: 'E' }, { min: -56, max: -48, band: 'F' },
  { min: -48, max: -40, band: 'G' }, { min: -40, max: -32, band: 'H' },
  { min: -32, max: -24, band: 'J' }, { min: -24, max: -16, band: 'K' },
  { min: -16, max: -8, band: 'L' }, { min: -8, max: 0, band: 'M' },
  { min: 0, max: 8, band: 'N' }, { min: 8, max: 16, band: 'P' },
  { min: 16, max: 24, band: 'Q' }, { min: 24, max: 32, band: 'R' },
  { min: 32, max: 40, band: 'S' }, { min: 40, max: 48, band: 'T' },
  { min: 48, max: 56, band: 'U' }, { min: 56, max: 64, band: 'V' },
  { min: 64, max: 72, band: 'W' }, { min: 72, max: 84, band: 'X' },
]
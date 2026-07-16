/**
 * CRSEngine — Coordinate Reference System Engine
 * Pure functions, no state, no dependencies.
 * 
 * Usage:
 *   import { CRSEngine } from '../services/crs'
 *   CRSEngine.getDistance(lat1, lng1, lat2, lng2)
 */

import { haversineDistance, bearing, destinationPoint, midpoint } from './wgs84'
import { wgs84ToUTM, getUTMZone, getUTMZoneLetter, getEPSGForUTM, detectEPSG } from './utm'
import { validateCoordinate, validateBBox, isValidZoom, isValidUTMZone, isValidBearing, clampLat, clampLng } from './validators'
import { generateGrid, generateRadialGrid, generateTransect, bboxCenter, expandBBox } from './projection'

export const CRSEngine = {
  // Distance & Bearing
  getDistance: haversineDistance,
  getBearing: bearing,
  getDestination: destinationPoint,
  getMidpoint: midpoint,

  // UTM / Projection
  wgs84ToUTM,
  getUTMZone,
  getUTMZoneLetter,
  getEPSGForUTM,
  detectEPSG,

  // Validation
  validateCoordinate,
  validateBBox,
  isValidZoom,
  isValidUTMZone,
  isValidBearing,
  clampLat,
  clampLng,

  // Grid Generation
  generateGrid,
  generateRadialGrid,
  generateTransect,
  bboxCenter,
  expandBBox,
}

export default CRSEngine
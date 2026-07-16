/**
 * OGC Services — WMS, WMTS, WFS
 * 
 * Exports:
 *   WMS — getCapabilities, getMap, getFeatureInfo
 *   WMTS — getCapabilities, getTile
 *   WFS — getCapabilities, getFeature
 */

export { getCapabilities, getMap, getFeatureInfo } from './wms'

/**
 * WMTS — Get capabilities for tile matrix
 */
export function getWMTSCapabilities(baseUrl) {
  return {
    service: 'WMTS',
    version: '1.0.0',
    layers: ['geology', 'thermal', 'spectral', 'elevation'],
    formats: ['image/png'],
    tileMatrixSets: ['EPSG:4326:1', 'EPSG:3857:1'],
  }
}

/**
 * WFS — Get features as GeoJSON
 */
export function getWFSFeature(layer, bbox) {
  return {
    type: 'FeatureCollection',
    features: [],
    metadata: { layer, bbox, generatedAt: new Date().toISOString() },
  }
}

export default { WMS: { getCapabilities, getMap, getFeatureInfo }, getWMTSCapabilities, getWFSFeature }
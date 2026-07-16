/**
 * WMS Service — OGC Web Map Service
 * Serves georeferenced map images via WMS protocol.
 * 
 * Standard WMS parameters:
 *   SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap
 *   &LAYERS=geology,thermal&CRS=EPSG:4326
 *   &BBOX=106, -7, 108, -6&WIDTH=800&HEIGHT=600
 *   &FORMAT=image/png
 */

import { getLayerData } from './data'

/**
 * Handle WMS GetCapabilities request
 * Returns server metadata and available layers
 */
export function getCapabilities(baseUrl) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0"
  xmlns="http://www.opengis.net/wms"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/wms http://schemas.opengis.net/wms/1.3.0/capabilities_1_3_0.xsd">
  <Service>
    <Name>GEOSAT PRO WMS</Name>
    <Title>Geosat Pro Enterprise WMS Service</Title>
    <Abstract>Thermal lithology and geological survey WMS</Abstract>
  </Service>
  <Capability>
    <Request>
      <GetCapabilities><Format>text/xml</Format></GetCapabilities>
      <GetMap><Format>image/png</Format><Format>image/jpeg</Format></GetMap>
      <GetFeatureInfo><Format>text/plain</Format><Format>application/json</Format></GetFeatureInfo>
    </Request>
    <Layer>
      <Title>GEOSAT PRO Layers</Title>
      <CRS>EPSG:4326</CRS>
      <CRS>EPSG:3857</CRS>
      <Layer queryable="1">
        <Name>geology</Name>
        <Title>Geological Map</Title>
        <Abstract>Geological formations from Macrostrat</Abstract>
      </Layer>
      <Layer queryable="1">
        <Name>thermal</Name>
        <Title>Thermal Anomaly</Title>
        <Abstract>Surface temperature and thermal anomaly</Abstract>
      </Layer>
      <Layer queryable="1">
        <Name>spectral</Name>
        <Title>Spectral Indices</Title>
        <Abstract>Iron oxide, clay, silica, NDVI indices</Abstract>
      </Layer>
      <Layer queryable="1">
        <Name>elevation</Name>
        <Title>Elevation (SRTM)</Title>
        <Abstract>SRTM elevation data from Open-Meteo</Abstract>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`
}

/**
 * Handle WMS GetMap request
 * Returns a map image for the requested bounding box
 */
export async function getMap(params) {
  const { layers, bbox, width, height, format, crs } = params
  const [west, south, east, north] = (bbox || '106,-7,108,-6').split(',').map(Number)

  // Parse requested layers
  const layerList = (layers || 'geology').split(',')

  // Generate composite image data
  const results = []
  for (const layer of layerList) {
    const data = await getLayerData(layer, north, south, east, west, parseInt(width || 200), parseInt(height || 200))
    results.push({ layer, ...data })
  }

  return {
    contentType: format === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    data: results,
    metadata: {
      layers: layerList,
      bbox: { west, south, east, north },
      width: parseInt(width || 200),
      height: parseInt(height || 200),
      crs: crs || 'EPSG:4326',
    },
  }
}

/**
 * Handle WMS GetFeatureInfo request
 * Returns attribute info for a specific pixel
 */
export async function getFeatureInfo(params) {
  const { layers, bbox, x, y, width, height, info_format } = params
  const [west, south, east, north] = (bbox || '106,-7,108,-6').split(',').map(Number)

  // Convert pixel coordinates to geographic
  const w = parseInt(width || 200)
  const h = parseInt(height || 200)
  const px = parseInt(x || 0)
  const py = parseInt(y || 0)
  const lat = north - (py / h) * (north - south)
  const lng = west + (px / w) * (east - west)

  const layerList = (layers || 'geology').split(',')
  const features = []

  for (const layer of layerList) {
    features.push({
      layer,
      lat,
      lng,
      info: await getPointInfo(layer, lat, lng),
    })
  }

  return features
}
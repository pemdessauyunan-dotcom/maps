/**
 * GeoJSON Format Exporter
 */

/**
 * Convert array of points to GeoJSON FeatureCollection
 * @param {Array<Object>} features - Points with lat, lng, and optional properties
 * @returns {string} GeoJSON string
 */
export function exportGeoJSON(features) {
  if (!features || features.length === 0) return JSON.stringify({ type: 'FeatureCollection', features: [] }, null, 2)

  const geojson = {
    type: 'FeatureCollection',
    features: features.map(f => {
      const { lat, lng, ...props } = f
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lng || props.lng, lat || props.lat],
        },
        properties: cleanProps(props),
      }
    }),
  }

  return JSON.stringify(geojson, null, 2)
}

/**
 * Convert analysis result to GeoJSON
 * @param {Object} analysis
 * @returns {string}
 */
export function analysisToGeoJSON(analysis) {
  if (!analysis?.thermal) return exportGeoJSON([])

  const { thermal, spectral, alteration, prospectivity, depth, geology } = analysis

  const feature = {
    lat: thermal.lat,
    lng: thermal.lng,
    elevation: thermal.elevation,
    surface_temp: thermal.temperature?.surface,
    thermal_anomaly: thermal.temperature?.anomaly,
    anomaly_level: thermal.anomalyLevel,
    rock_type: thermal.lithology?.rockType,
    iron_oxide: spectral?.indices?.iron_oxide,
    clay_minerals: spectral?.indices?.clay_minerals,
    silica_index: spectral?.indices?.silica_index,
    ndvi: spectral?.indices?.ndvi,
    alteration_zone: alteration?.name,
    prospectivity_score: prospectivity?.score,
    depth_m: depth?.depth,
    formation: geology?.formation,
  }

  return exportGeoJSON([feature])
}

function cleanProps(props) {
  const cleaned = {}
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined && value !== null && key !== 'lat' && key !== 'lng') {
      cleaned[key] = value
    }
  }
  return cleaned
}
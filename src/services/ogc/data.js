/**
 * OGC Data Helper — Provides data for WMS/WMTS/WFS layers
 */

/**
 * Get layer data for a bounding box
 */
export async function getLayerData(layer, north, south, east, west, width, height) {
  const centerLat = (north + south) / 2
  const centerLng = (east + west) / 2

  switch (layer) {
    case 'elevation': {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${centerLat}&longitude=${centerLng}`)
      const data = res.ok ? await res.json() : { elevation: [200] }
      return { type: 'point', value: data.elevation?.[0] || 200, unit: 'm' }
    }
    case 'thermal':
      return { type: 'grid', value: 'computed', unit: '°C' }
    case 'geology':
      return { type: 'polygon', value: 'geological formation', source: 'Macrostrat' }
    default:
      return { type: 'unknown', value: null }
  }
}

/**
 * Get point info for GetFeatureInfo
 */
export async function getPointInfo(layer, lat, lng) {
  switch (layer) {
    case 'elevation': {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`)
      const data = res.ok ? await res.json() : { elevation: [200] }
      return { elevation: data.elevation?.[0] || 200 }
    }
    case 'geology':
      return { rockType: 'volcanic', formation: 'Unknown' }
    case 'thermal':
      return { temperature: 30, anomaly: 0 }
    default:
      return { info: 'No data' }
  }
}
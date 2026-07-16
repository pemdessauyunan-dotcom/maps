import { fetchElevationBatch } from './elevationApi'

/**
 * Fetch terrain grid for lineament analysis
 * @param {number} lat
 * @param {number} lng
 * @param {number} radius - Radius in km
 * @param {number} gridSize - Grid resolution (expert: 3-5, standard: 7)
 * @returns {Promise<Array<{lat, lng, elevation}>>}
 */
export async function fetchTerrainGrid(lat, lng, radius = 0.5, gridSize = 3) {
  const points = []
  const latStep = (radius * 2) / (gridSize - 1) / 111
  const lngStep = latStep / Math.cos(lat * Math.PI / 180)
  const startLat = lat - radius / 111
  const startLng = lng - (radius / 111) / Math.cos(lat * Math.PI / 180)

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      points.push({ lat: startLat + i * latStep, lng: startLng + j * lngStep })
    }
  }
  const elevations = await fetchElevationBatch(points)
  return points.map((p, i) => ({ ...p, elevation: elevations[i] ?? 0 }))
}
// Real Anomaly Detection Engine
// Uses actual elevation data from Open-Meteo and geological data from Macrostrat

import { fetchElevationBatch, fetchSurroundingTerrain } from './elevationApi'
import { fetchGeologicalInfo } from './geologicalApi'

/**
 * Analyze terrain anomaly at a specific location
 * Fetches surrounding terrain and compares center point against neighbors
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm - Search radius in km
 * @returns {Promise<Object>} Anomaly analysis result
 */
export async function analyzeTerrainAnomaly(lat, lng, radiusKm = 0.3) {
  // Fetch surrounding terrain (7x7 grid = 49 points)
  const terrain = await fetchSurroundingTerrain(lat, lng, radiusKm, 7)

  if (terrain.length < 9) {
    return { anomalyScore: 0, type: 'insufficient_data', confidence: 0 }
  }

  // Find center point
  const center = terrain.find(p =>
    Math.abs(p.lat - lat) < 0.0001 && Math.abs(p.lng - lng) < 0.0001
  ) || terrain[Math.floor(terrain.length / 2)]

  const neighbors = terrain.filter(p => p !== center)
  const avgElev = neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length
  const elevStdDev = Math.sqrt(
    neighbors.reduce((s, n) => s + Math.pow(n.elevation - avgElev, 2), 0) / neighbors.length
  )

  const elevDiff = avgElev - center.elevation
  const normalizedDiff = elevStdDev > 0 ? elevDiff / elevStdDev : 0

  // Calculate slope from terrain gradient
  const slope = calculateSlope(terrain)
  const curvature = calculateCurvature(terrain)

  let anomalyScore = 0
  let anomalyType = 'normal'
  let description = ''

  // Depression detection (possible tunnel/cavity/room below)
  if (elevDiff > 2 && normalizedDiff > 1.5) {
    anomalyScore = Math.min(normalizedDiff / 4, 1)
    anomalyType = 'depression'
    description = `Terrain depression detected: ${elevDiff.toFixed(1)}m below surroundings. Possible underground cavity or tunnel.`
  }
  // Elevation spike (possible mound/buried structure)
  else if (elevDiff < -2 && normalizedDiff < -1.5) {
    anomalyScore = Math.min(Math.abs(normalizedDiff) / 4, 1)
    anomalyType = 'elevation_spike'
    description = `Unusual elevation: ${Math.abs(elevDiff).toFixed(1)}m above surroundings. Possible buried structure or mound.`
  }
  // Flat area anomaly (sudden flat zone in uneven terrain)
  else if (curvature > 0.8 && slope < 2) {
    anomalyScore = 0.4
    anomalyType = 'flat_anomaly'
    description = 'Unusually flat area detected. Could indicate buried structure or filled cavity.'
  }
  // Linear depression (possible tunnel)
  else if (isLinearDepression(terrain)) {
    anomalyScore = 0.6
    anomalyType = 'linear_depression'
    description = 'Linear depression pattern detected. Possible tunnel or buried channel.'
  }

  return {
    lat,
    lng,
    elevation: center.elevation,
    anomalyScore,
    anomalyType,
    description,
    confidence: Math.min(anomalyScore * 0.8 + (elevStdDev > 1 ? 0.2 : 0), 1),
    stats: {
      avgElevation: avgElev.toFixed(1),
      elevationDiff: elevDiff.toFixed(1),
      stdDev: elevStdDev.toFixed(2),
      slope: slope.toFixed(1),
      curvature: curvature.toFixed(2),
      samplePoints: terrain.length,
    },
    terrain,
  }
}

/**
 * Detect underground structures from an array of GPS points
 * Uses real elevation data comparison
 */
export async function detectUndergroundStructures(points) {
  if (points.length < 3) {
    return { anomalies: [], summary: 'Need at least 3 points for analysis' }
  }

  // Fetch real elevations for all points (batch)
  const elevations = await fetchElevationBatch(points)
  const pointsWithElev = points.map((p, i) => ({
    ...p,
    elevation: elevations[i] ?? p.elevation ?? 0,
  }))

  const anomalies = []

  for (let i = 0; i < pointsWithElev.length; i++) {
    const point = pointsWithElev[i]

    // Find neighbors within 500m
    const neighbors = pointsWithElev.filter((_, j) => {
      if (j === i) return false
      const dist = haversineKm(point, pointsWithElev[j])
      return dist < 0.5
    })

    if (neighbors.length < 2) continue

    const avgElev = neighbors.reduce((s, n) => s + n.elevation, 0) / neighbors.length
    const elevDiff = avgElev - point.elevation
    const stdDev = Math.sqrt(
      neighbors.reduce((s, n) => s + Math.pow(n.elevation - avgElev, 2), 0) / neighbors.length
    )

    const normalizedDiff = stdDev > 0 ? elevDiff / stdDev : 0
    let score = 0
    let type = 'normal'

    if (elevDiff > 2 && normalizedDiff > 1.5) {
      score = Math.min(normalizedDiff / 4, 1)
      type = 'depression'
    } else if (elevDiff < -2 && normalizedDiff < -1.5) {
      score = Math.min(Math.abs(normalizedDiff) / 4, 1)
      type = 'elevation_spike'
    }

    if (score > 0.2) {
      anomalies.push({
        ...point,
        anomalyScore: score,
        anomalyType: type,
        elevationDiff: elevDiff.toFixed(1),
        neighbors: neighbors.length,
        avgNeighborElev: avgElev.toFixed(1),
      })
    }
  }

  return {
    anomalies,
    summary: {
      totalPoints: points.length,
      anomaliesFound: anomalies.length,
      maxScore: anomalies.length > 0 ? Math.max(...anomalies.map(a => a.anomalyScore)).toFixed(2) : 0,
      avgScore: anomalies.length > 0 ? (anomalies.reduce((s, a) => s + a.anomalyScore, 0) / anomalies.length).toFixed(2) : 0,
    },
  }
}

/**
 * Full terrain analysis with geological context
 */
export async function fullTerrainAnalysis(lat, lng) {
  // Run terrain anomaly detection
  const terrainResult = await analyzeTerrainAnomaly(lat, lng)

  // Get geological info
  const geoInfo = await fetchGeologicalInfo(lat, lng)

  // Combine results
  let combinedScore = terrainResult.anomalyScore

  // Boost score if geological data supports anomaly
  if (geoInfo.rockType === 'limestone' && terrainResult.anomalyType === 'depression') {
    combinedScore = Math.min(combinedScore * 1.3, 1) // Karst caves likely
  }
  if (geoInfo.mineralPotential?.length > 0) {
    const maxMineralProb = Math.max(...geoInfo.mineralPotential.map(m => m.probability))
    combinedScore = Math.min(combinedScore + maxMineralProb * 0.2, 1)
  }

  return {
    ...terrainResult,
    geological: geoInfo,
    combinedScore,
    recommendation: getRecommendation(combinedScore, terrainResult.anomalyType, geoInfo),
  }
}

/**
 * Get recommendation based on analysis
 */
function getRecommendation(score, anomalyType, geoInfo) {
  if (score > 0.8) {
    return 'HIGH PRIORITY: Strong anomaly detected. Recommend ground-penetrating radar (GPR) survey.'
  }
  if (score > 0.6) {
    if (anomalyType === 'depression') {
      return `LIKELY: Terrain depression in ${geoInfo.rockType} formation. Possible cave or tunnel entrance.`
    }
    return `LIKELY: Significant anomaly. Further investigation with magnetometer recommended.`
  }
  if (score > 0.4) {
    return 'MODERATE: Notable terrain feature. Consider manual inspection or metal detector survey.'
  }
  if (score > 0.2) {
    return 'LOW: Minor anomaly detected. May be natural terrain variation.'
  }
  return 'NORMAL: No significant anomalies detected at this location.'
}

// --- Helper functions ---

function calculateSlope(terrain) {
  if (terrain.length < 4) return 0
  const elevations = terrain.map(p => p.elevation)
  const maxElev = Math.max(...elevations)
  const minElev = Math.min(...elevations)
  const range = maxElev - minElev
  // Approximate slope in degrees
  return Math.atan(range / 500) * (180 / Math.PI) // 500m approximate spread
}

function calculateCurvature(terrain) {
  if (terrain.length < 9) return 0
  const elevations = terrain.map(p => p.elevation)
  const mean = elevations.reduce((s, e) => s + e, 0) / elevations.length
  const variance = elevations.reduce((s, e) => s + Math.pow(e - mean, 2), 0) / elevations.length
  const stdDev = Math.sqrt(variance)
  // Normalized curvature: low variance = flat = high curvature score
  return stdDev < 2 ? 0.9 : stdDev < 5 ? 0.5 : 0.1
}

function isLinearDepression(terrain) {
  if (terrain.length < 9) return false
  const sorted = [...terrain].sort((a, b) => a.lng - b.lng)
  const elevations = sorted.map(p => p.elevation)
  const mid = Math.floor(elevations.length / 2)
  const firstHalf = elevations.slice(0, mid)
  const secondHalf = elevations.slice(mid)
  const avgFirst = firstHalf.reduce((s, e) => s + e, 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, e) => s + e, 0) / secondHalf.length
  // Check if there's a linear low zone in the middle
  const middleElev = elevations.slice(Math.floor(mid * 0.7), Math.ceil(mid * 1.3))
  const avgMiddle = middleElev.reduce((s, e) => s + e, 0) / middleElev.length
  return avgMiddle < (avgFirst + avgSecond) / 2 - 3
}

function haversineKm(p1, p2) {
  const R = 6371
  const dLat = (p2.lat - p1.lat) * Math.PI / 180
  const dLng = (p2.lng - p1.lng) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Get anomaly color based on score
 */
export function getAnomalyColor(score) {
  if (score < 0.2) return '#00ff88'
  if (score < 0.4) return '#88ff00'
  if (score < 0.6) return '#ffdd00'
  if (score < 0.8) return '#ff8800'
  return '#ff4444'
}

/**
 * Get anomaly label based on score
 */
export function getAnomalyLabel(score) {
  if (score < 0.2) return 'Normal'
  if (score < 0.4) return 'Low'
  if (score < 0.6) return 'Moderate'
  if (score < 0.8) return 'High'
  return 'Critical'
}

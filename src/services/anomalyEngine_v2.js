/**
 * Enhanced Anomaly Detection Engine v2
 * Multi-index satellite detection + AI-assisted classification + curvature analysis
 */

// Satellite spectral indices for mineral/underground detection
export const SATELLITE_INDICES = {
  ironOxide: {
    name: 'Iron Oxide (B4/B2)',
    formula: 'B4 / B2',
    bands: ['B4', 'B2'],
    description: 'Mendeteksi oksida besi - indikasi mineral logam, alterasi hidrotermal',
    weight: 0.35,
  },
  clayMinerals: {
    name: 'Clay Minerals (B7/B11)',
    formula: 'B7 / B11',
    bands: ['B7', 'B11'],
    description: 'Mendeteksi mineral lempung (kaolinit, illit) - alterasi hidrotermal dekat emas',
    weight: 0.25,
  },
  ferrousMinerals: {
    name: 'Ferrous Minerals (B11/B12)',
    formula: 'B11 / B12',
    bands: ['B11', 'B12'],
    description: 'Mendeteksi mineral besi dalam - indikasi intrusi mineral dalam',
    weight: 0.15,
  },
  silicaIndex: {
    name: 'Silica Index (inverted B11/B12)',
    formula: '1 - (B11/B12)',
    bands: ['B11', 'B12'],
    description: 'Zona kuarsa/silika tinggi - sering berasosiasi dengan emas',
    weight: 0.10,
  },
  ndvi: {
    name: 'NDVI - Vegetation Stress',
    formula: '(B8 - B4)/(B8 + B4)',
    bands: ['B8', 'B4'],
    description: 'Vegetasi stress di atas anomali bawah tanah - indikasi rongga/terowongan',
    weight: 0.15,
  },
}

/**
 * Calculate combined mineral potential score from all indices
 * @param {Object} indices - { ironOxide, clayMinerals, ferrousMinerals, silicaIndex, ndvi }
 * @returns {Object} Combined score with breakdown
 */
export function calculateCombinedMineralScore(indices) {
  const breakdown = {}
  let totalWeight = 0
  let weightedSum = 0

  for (const [key, meta] of Object.entries(SATELLITE_INDICES)) {
    const raw = indices[key]
    if (raw == null) continue

    // Normalize each index to 0-1
    let normalized = 0
    switch (key) {
      case 'ironOxide':
        normalized = clamp((raw - 0.7) / 1.5, 0, 1) // 0.7-2.2 range
        break
      case 'clayMinerals':
        normalized = clamp((raw - 0.5) / 1.0, 0, 1)
        break
      case 'ferrousMinerals':
        normalized = clamp((raw - 0.3) / 0.8, 0, 1)
        break
      case 'silicaIndex':
        normalized = clamp(raw, 0, 1) // already inverted
        break
      case 'ndvi':
        normalized = clamp(1 - raw, 0, 1) // low NDVI = high stress = anomaly
        break
    }

    breakdown[key] = {
      raw,
      normalized,
      weight: meta.weight,
      description: meta.description,
    }
    weightedSum += normalized * meta.weight
    totalWeight += meta.weight
  }

  const combined = totalWeight > 0 ? weightedSum / totalWeight : 0

  let anomalyLevel = 'low'
  if (combined > 0.7) anomalyLevel = 'critical'
  else if (combined > 0.5) anomalyLevel = 'high'
  else if (combined > 0.3) anomalyLevel = 'moderate'

  return {
    combined: Math.round(combined * 1000) / 1000,
    anomalyLevel,
    breakdown,
    confidence: calculateConfidence(breakdown),
    primaryIndicator: getPrimaryIndicator(breakdown),
  }
}

/**
 * Classify anomaly type using pattern recognition
 * @param {Object} terrain - { elevations: number[][], slope, curvature }
 * @param {Object} satelliteData - combined mineral score & indices
 * @returns {Object} Classification result
 */
export function classifyAnomalyAI(terrain, satelliteData) {
  const features = extractFeatures(terrain)
  const classifications = []
  const confidenceScores = []

  // 1. Tunnel detection: linear depression + vegetation stress + high iron
  const tunnelScore = calculateTunnelScore(features, satelliteData)
  classifications.push({ type: 'tunnel', score: tunnelScore })
  if (tunnelScore > 0.3) confidenceScores.push(tunnelScore)

  // 2. Cave detection: circular depression + curvature anomaly
  const caveScore = calculateCaveScore(features)
  classifications.push({ type: 'cave', score: caveScore })
  if (caveScore > 0.3) confidenceScores.push(caveScore)

  // 3. Gold deposit: high clay + high iron + quartz zone
  const goldScore = calculateGoldScore(satelliteData)
  classifications.push({ type: 'gold_deposit', score: goldScore })
  if (goldScore > 0.3) confidenceScores.push(goldScore)

  // 4. Iron deposit: high iron + high ferrous
  const ironScore = calculateIronScore(satelliteData)
  classifications.push({ type: 'iron_deposit', score: ironScore })
  if (ironScore > 0.3) confidenceScores.push(ironScore)

  // 5. Buried structure: geometric depression pattern
  const structureScore = calculateStructureScore(features)
  classifications.push({ type: 'buried_structure', score: structureScore })
  if (structureScore > 0.3) confidenceScores.push(structureScore)

  // Pick best classification
  classifications.sort((a, b) => b.score - a.score)
  const best = classifications[0]
  const overallConfidence = confidenceScores.length > 0
    ? Math.min(confidenceScores.reduce((s, c) => s + c, 0) / confidenceScores.length + 0.1, 1)
    : 0

  return {
    primaryType: best.type,
    primaryScore: best.score,
    allClassifications: classifications.filter(c => c.score > 0.2),
    confidence: overallConfidence,
    features,
    recommendation: getRecommendation(best.type, best.score, features),
  }
}

/**
 * Enhanced terrain curvature analysis for tunnel detection
 */
export function analyzeTerrainCurvature(points, bounds) {
  if (points.length < 9) return { curvatures: [], linearDepressions: [] }

  const { north, south, east, west } = bounds
  const rows = 20
  const cols = Math.round(rows * (east - west) / (north - south) * Math.cos((north + south) / 2 * Math.PI / 180))

  // Build grid
  const grid = []
  for (let row = 0; row < rows; row++) {
    grid[row] = []
    for (let col = 0; col < cols; col++) {
      const lat = north - (row / rows) * (north - south)
      const lng = west + (col / cols) * (east - west)
      grid[row][col] = interpolateElevation(lat, lng, points)
    }
  }

  // Calculate curvature in multiple directions
  const curvatures = []
  const linearDepressions = []

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const lat = north - (row / rows) * (north - south)
      const lng = west + (col / cols) * (east - west)

      // Profile curvature (vertical)
      const profCurv = grid[row + 1][col] + grid[row - 1][col] - 2 * grid[row][col]
      // Plan curvature (horizontal)
      const planCurv = grid[row][col + 1] + grid[row][col - 1] - 2 * grid[row][col]
      // Diagonal curvatures
      const diag1Curv = grid[row + 1][col + 1] + grid[row - 1][col - 1] - 2 * grid[row][col]
      const diag2Curv = grid[row + 1][col - 1] + grid[row - 1][col + 1] - 2 * grid[row][col]

      const totalCurvature = (profCurv + planCurv + diag1Curv + diag2Curv) / 4

      curRow = row
      curCol = col

      curvatures.push({
        lat,
        lng,
        profileCurvature: profCurv,
        planCurvature: planCurv,
        totalCurvature,
        elevation: grid[row][col],
      })

      // Detect linear depressions: high plan curvature + negative profile
      // Tunnel signature: linear trough, not circular pit
      if (planCurv > 2 && profCurv < -1 && totalCurvature > 0.5) {
        linearDepressions.push({
          lat,
          lng,
          intensity: Math.min(Math.abs(profCurv) * planCurv / 10, 1),
          direction: Math.abs(profCurv) > Math.abs(planCurv) ? 'north-south' : 'east-west',
          elevation: grid[row][col],
        })
      }
    }
  }

  // Cluster nearby linear depressions into tunnel lines
  const tunnelLines = clusterLinearDepressions(linearDepressions, 0.001)

  return {
    curvatures,
    linearDepressions: linearDepressions.sort((a, b) => b.intensity - a.intensity),
    tunnelLines,
    stats: {
      avgCurvature: curvatures.reduce((s, c) => s + c.totalCurvature, 0) / curvatures.length,
      maxCurvature: Math.max(...curvatures.map(c => c.totalCurvature)),
      linearDepressionCount: linearDepressions.length,
      tunnelLineCount: tunnelLines.length,
    },
  }
}

/**
 * Calculate elevation cross-section profile
 */
export function calculateCrossSection(startLat, startLng, endLat, endLng, points, steps = 50) {
  const profile = []
  const dLat = (endLat - startLat) / steps
  const dLng = (endLng - startLng) / steps

  for (let i = 0; i <= steps; i++) {
    const lat = startLat + dLat * i
    const lng = startLng + dLng * i
    const elevation = interpolateElevation(lat, lng, points)
    const distance = haversineMeters(startLat, startLng, lat, lng)
    profile.push({ lat, lng, elevation, distance })
  }

  // Find lowest points (potential tunnel entrances)
  const avgElev = profile.reduce((s, p) => s + p.elevation, 0) / profile.length
  const troughs = []
  for (let i = 1; i < profile.length - 1; i++) {
    if (profile[i].elevation < profile[i - 1].elevation &&
        profile[i].elevation < profile[i + 1].elevation &&
        (avgElev - profile[i].elevation) > 2) {
      troughs.push({
        ...profile[i],
        depth: avgElev - profile[i].elevation,
      })
    }
  }

  const minElev = Math.min(...profile.map(p => p.elevation))
  const maxElev = Math.max(...profile.map(p => p.elevation))
  const totalDistance = profile[profile.length - 1].distance

  return {
    profile,
    troughs: troughs.sort((a, b) => b.depth - a.depth),
    stats: {
      minElev: Math.round(minElev),
      maxElev: Math.round(maxElev),
      totalDistance: Math.round(totalDistance),
      elevRange: Math.round(maxElev - minElev),
      troughCount: troughs.length,
      maxDepth: troughs.length > 0 ? Math.round(troughs[0].depth) : 0,
    },
  }
}

// ============== Helper Functions ==============

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function calculateConfidence(breakdown) {
  const keys = Object.keys(breakdown)
  const validCount = keys.filter(k => breakdown[k].normalized > 0.1).length
  return Math.min(validCount / keys.length + 0.2, 1)
}

function getPrimaryIndicator(breakdown) {
  let maxKey = null, maxVal = 0
  for (const [k, v] of Object.entries(breakdown)) {
    if (v.normalized > maxVal) {
      maxVal = v.normalized
      maxKey = k
    }
  }
  return maxKey ? { index: maxKey, ...SATELLITE_INDICES[maxKey], value: maxVal } : null
}

function extractFeatures(terrain) {
  const { elevations, slope, curvature } = terrain
  return {
    maxSlope: slope || 0,
    curvature: curvature || 0,
    linearityIndex: calculateLinearity(elevations),
    circularityIndex: calculateCircularity(elevations),
    varianceRatio: elevations ? calculateVarianceRatio(elevations) : 0,
  }
}

function calculateLinearity(elevations) {
  if (!elevations || elevations.length < 9) return 0
  const rows = elevations.length
  const cols = elevations[0]?.length || 0
  if (cols < 3) return 0

  // Check if depression pattern is linear (tunnel-like) vs circular (cave-like)
  let linearScore = 0
  let sampleCount = 0

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 2; c < cols - 2; c++) {
      const center = elevations[r][c]
      const left = elevations[r][c - 1]
      const right = elevations[r][c + 1]
      const up = elevations[r - 1][c]
      const down = elevations[r + 1][c]

      // Linear: left-right low, up-down high
      if (center < left && center < right && center < up && center < down) {
        // Check if more linear east-west than north-south
        const ewDiff = Math.abs(left - right)
        const nsDiff = Math.abs(up - down)
        if (ewDiff < nsDiff) linearScore += 1 // east-west tunnel
        else linearScore += 0.5
        sampleCount++
      }
    }
  }

  return sampleCount > 0 ? linearScore / sampleCount : 0
}

function calculateCircularity(elevations) {
  if (!elevations || elevations.length < 9) return 0
  const rows = elevations.length
  const cols = elevations[0]?.length || 0
  if (cols < 3) return 0

  let circularScore = 0
  let sampleCount = 0

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const center = elevations[r][c]
      const neighbors = [
        elevations[r - 1][c - 1], elevations[r - 1][c], elevations[r - 1][c + 1],
        elevations[r][c - 1],                     elevations[r][c + 1],
        elevations[r + 1][c - 1], elevations[r + 1][c], elevations[r + 1][c + 1],
      ].filter(e => e != null)

      if (neighbors.length < 4) continue
      const avg = neighbors.reduce((s, e) => s + e, 0) / neighbors.length
      if (center < avg - 2) {
        // Check if it's surrounded on all sides (circular)
        const allLower = neighbors.filter(e => e > center).length
        circularScore += allLower / neighbors.length
        sampleCount++
      }
    }
  }

  return sampleCount > 0 ? circularScore / sampleCount : 0
}

function calculateVarianceRatio(elevations) {
  if (!elevations || elevations.length < 3) return 0
  const flat = elevations.flat().filter(e => e != null)
  if (flat.length < 9) return 0
  const mean = flat.reduce((s, e) => s + e, 0) / flat.length
  const variance = flat.reduce((s, e) => s + Math.pow(e - mean, 2), 0) / flat.length
  const stdDev = Math.sqrt(variance)
  return mean > 0 ? stdDev / mean : 0
}

function calculateTunnelScore(features, satelliteData) {
  let score = 0
  // High linearity + moderate curvature = tunnel
  score += features.linearityIndex * 0.4
  score += features.varianceRatio * 0.2
  // Satellite: low NDVI (vegetation stress) + moderate iron
  if (satelliteData?.breakdown?.ndvi?.normalized > 0.4) score += 0.2
  if (satelliteData?.breakdown?.ironOxide?.normalized > 0.3) score += 0.1
  // Soil moisture anomaly (clay = possible tunnel fill)
  if (satelliteData?.breakdown?.clayMinerals?.normalized > 0.3) score += 0.1
  return Math.min(score, 1)
}

function calculateCaveScore(features) {
  let score = 0
  // High circularity = cave/sinkhole
  score += features.circularityIndex * 0.5
  score += features.curvature * 0.2
  return Math.min(score, 1)
}

function calculateGoldScore(satelliteData) {
  if (!satelliteData?.breakdown) return 0
  let score = 0
  // Gold signature: high clay (alteration) + high iron oxide + quartz zone
  if (satelliteData.breakdown.clayMinerals?.normalized > 0.5) score += 0.3
  if (satelliteData.breakdown.ironOxide?.normalized > 0.4) score += 0.25
  if (satelliteData.breakdown.silicaIndex?.normalized > 0.4) score += 0.2
  if (satelliteData.breakdown.ferrousMinerals?.normalized > 0.3) score += 0.15
  return Math.min(score, 1)
}

function calculateIronScore(satelliteData) {
  if (!satelliteData?.breakdown) return 0
  let score = 0
  if (satelliteData.breakdown.ironOxide?.normalized > 0.5) score += 0.4
  if (satelliteData.breakdown.ferrousMinerals?.normalized > 0.5) score += 0.35
  if (satelliteData.breakdown.silicaIndex?.normalized < 0.3) score += 0.1 // low silica = pure iron
  return Math.min(score, 1)
}

function calculateStructureScore(features) {
  let score = 0
  // Geometric pattern: moderate linearity + low circularity
  score += features.linearityIndex * 0.3
  score += (1 - features.circularityIndex) * 0.2
  // Sharp edges = high variance ratio
  if (features.varianceRatio > 0.5) score += 0.25
  return Math.min(score, 1)
}

function interpolateElevation(lat, lng, points) {
  // IDW interpolation
  let numerator = 0, denominator = 0
  for (const p of points) {
    if (p.elevation == null) continue
    const dLat = (p.lat - lat) * 111000
    const dLng = (p.lng - lng) * 111000 * Math.cos(lat * Math.PI / 180)
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < 0.001) return p.elevation
    const weight = 1 / Math.pow(dist, 2)
    numerator += weight * p.elevation
    denominator += weight
  }
  return denominator > 0 ? numerator / denominator : 0
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function clusterLinearDepressions(points, threshold) {
  if (points.length < 3) return []
  const clusters = []
  const used = new Set()

  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue
    const cluster = [points[i]]
    used.add(i)

    // Find connected points
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue
      const dLat = Math.abs(points[j].lat - points[i].lat)
      const dLng = Math.abs(points[j].lng - points[i].lng)
      if (dLat < threshold && dLng < threshold) {
        cluster.push(points[j])
        used.add(j)
      }
    }

    if (cluster.length >= 2) {
      clusters.push({
        points: cluster,
        centerLat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
        centerLng: cluster.reduce((s, p) => s + p.lng, 0) / cluster.length,
        avgIntensity: cluster.reduce((s, p) => s + p.intensity, 0) / cluster.length,
        length: cluster.length,
        orientation: cluster.length > 1 ? getOrientation(cluster) : 'unknown',
      })
    }
  }

  return clusters.sort((a, b) => b.avgIntensity - a.avgIntensity)
}

function getOrientation(points) {
  const lats = points.map(p => p.lat)
  const lngs = points.map(p => p.lng)
  const latRange = Math.max(...lats) - Math.min(...lats)
  const lngRange = Math.max(...lngs) - Math.min(...lngs)
  if (latRange > lngRange * 1.5) return 'north-south'
  if (lngRange > latRange * 1.5) return 'east-west'
  return 'diagonal'
}

function getRecommendation(type, score, features) {
  if (score > 0.7) {
    switch (type) {
      case 'tunnel': return '🔴 PRIORITAS TINGGI: Pola terowongan kuat terdeteksi. GPR scan + investigasi entrance di kedua ujung depresi linear.'
      case 'cave': return '🔴 PRIORITAS TINGGI: Pola gua/sinkhole terdeteksi. Cek entrance alami, ukur dimensi dengan laser.'
      case 'gold_deposit': return '🔴 PRIORITAS TINGGI: Alterasi hidrotermal signifikan. Soil sampling + XRF analysis di titik ini.'
      case 'iron_deposit': return '🔴 PRIORITAS TINGGI: Konsentrasi besi tinggi. Magnetometer survey + bor eksplorasi.'
      case 'buried_structure': return '🔴 PRIORITAS TINGGI: Struktur geometris terkubur. GPR scan + cek peta sejarah.'
    }
  }
  if (score > 0.4) {
    return `🟡 MODERAT: ${type.replace('_', ' ')} terindikasi. Verifikasi lapangan dengan metal detector atau soil sampling.`
  }
  return '🟢 RENDAH: Anomali minor. Natural terrain variation kemungkinan besar.'
}
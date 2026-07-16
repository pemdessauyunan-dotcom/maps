/**
 * Lineament Analysis Engine
 * Mendeteksi lineament (struktur geologi seperti patahan, rekahan) dari data DEM.
 * 
 * Prinsip: Lineament = kelurusan morfologi yang terlihat dari:
 * - Perubahan slope drastis (break-in-slope)
 * - Pola drainase terdefleksi
 * - Sesar/scarp yang terlihat dari kontur rapat
 * - Anomali curvature (ridge/valley linear)
 * 
 * Implementasi: Grid-based analysis dari DEM → probabilitas lineament
 */

/**
 * Analyze lineaments from terrain grid
 * @param {Array<{lat, lng, elevation}>} terrainGrid - Grid of elevation points
 * @param {Object} center - Center point {lat, lng}
 * @returns {Object} Lineament analysis result
 */
export function analyzeLineaments(terrainGrid, center) {
  if (!terrainGrid || terrainGrid.length < 9) {
    return { lineaments: [], density: 0, confidence: 0, dominantDirection: null }
  }

  // 1. Calculate slope & aspect for each point
  const points = terrainGrid.map(p => {
    const neighbors = getNeighbors(terrainGrid, p)
    const slope = calculateSlope(p, neighbors)
    const aspect = calculateAspect(neighbors)
    const curvature = calculateCurvature(p, neighbors)
    return { ...p, slope, aspect, curvature }
  })

  // 2. Detect lineament candidates
  // Lineament = where slope changes abruptly (structural control)
  const lineaments = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!p.slope || p.slope < 5) continue // Min slope threshold

    // Check if this point is on a linear feature
    const lineamentScore = calcLineamentScore(p, points)
    if (lineamentScore > 0.4) {
      lineaments.push({
        lat: p.lat,
        lng: p.lng,
        score: lineamentScore,
        direction: p.aspect,
        slope: p.slope,
        curvature: p.curvature,
        type: classifyLineament(lineamentScore, p.slope, p.curvature),
      })
    }
  }

  // 3. Calculate lineament density
  const density = terrainGrid.length > 0 ? lineaments.length / terrainGrid.length : 0

  // 4. Determine dominant direction
  const directions = lineaments.filter(l => l.direction != null).map(l => l.direction)
  const dominantDirection = directions.length > 0 ? getDominantDirection(directions) : null

  // 5. Overall confidence
  const confidence = Math.min(1, density * 3 + (dominantDirection ? 0.2 : 0))

  return {
    lineaments: lineaments.slice(0, 50), // Max 50 lineaments
    density: parseFloat(density.toFixed(3)),
    confidence: parseFloat(confidence.toFixed(2)),
    dominantDirection,
    totalLineaments: lineaments.length,
    summary: generateLineamentSummary(density, dominantDirection, confidence),
  }
}

/**
 * Calculate lineament score for a point
 * Higher score = more likely to be on a lineament
 */
function calcLineamentScore(point, allPoints) {
  let score = 0

  // Factor 1: Slope magnitude (steeper = more likely structural)
  score += Math.min(point.slope / 45, 1) * 0.3

  // Factor 2: Curvature anomaly (linear ridges/valleys)
  if (point.curvature != null) {
    score += Math.min(Math.abs(point.curvature) * 5, 1) * 0.25
  }

  // Factor 3: Alignment with neighbors (linear feature)
  const alignedNeighbors = countAlignedNeighbors(point, allPoints)
  score += Math.min(alignedNeighbors / 4, 1) * 0.3

  // Factor 4: Slope aspect consistency
  const aspectConsistency = calcAspectConsistency(point, allPoints)
  score += aspectConsistency * 0.15

  return Math.min(1, score)
}

/**
 * Count neighbors that align in a linear pattern
 */
function countAlignedNeighbors(point, allPoints) {
  let count = 0
  const searchRadius = 0.005 // ~500m

  for (const other of allPoints) {
    if (other === point) continue
    const dLat = Math.abs(other.lat - point.lat)
    const dLng = Math.abs(other.lng - point.lng)
    if (dLat > searchRadius || dLng > searchRadius) continue

    // Check if slope direction aligns (within 30 degrees)
    if (point.aspect != null && other.aspect != null) {
      const angleDiff = Math.abs(point.aspect - other.aspect)
      if (angleDiff < 30 || angleDiff > 330) count++
    }
  }
  return count
}

/**
 * Calculate aspect consistency with neighbors
 */
function calcAspectConsistency(point, allPoints) {
  if (point.aspect == null) return 0
  let consistent = 0
  let total = 0

  for (const other of allPoints) {
    if (other === point || other.aspect == null) continue
    const dLat = Math.abs(other.lat - point.lat)
    const dLng = Math.abs(other.lng - point.lng)
    if (dLat > 0.01 || dLng > 0.01) continue

    const angleDiff = Math.abs(point.aspect - other.aspect)
    if (angleDiff < 45 || angleDiff > 315) consistent++
    total++
  }
  return total > 0 ? consistent / total : 0
}

/**
 * Classify lineament type
 */
function classifyLineament(score, slope, curvature) {
  if (score > 0.7 && slope > 30) return { id: 'major_fault', label: 'Sesar Utama', emoji: '🔴', severity: 'high' }
  if (score > 0.6 && curvature < -0.1) return { id: 'valley_lineament', label: 'Lineament Lembah', emoji: '🔵', severity: 'moderate' }
  if (score > 0.5 && curvature > 0.1) return { id: 'ridge_lineament', label: 'Lineament Punggungan', emoji: '🟠', severity: 'moderate' }
  if (score > 0.4) return { id: 'minor_fracture', label: 'Rekahan Minor', emoji: '🟡', severity: 'low' }
  return { id: 'uncertain', label: 'Lineament Tidak Pasti', emoji: '⚪', severity: 'low' }
}

/**
 * Get dominant direction of lineaments
 */
function getDominantDirection(directions) {
  // Bin directions into 8 cardinal directions
  const bins = { N: 0, NE: 0, E: 0, SE: 0, S: 0, SW: 0, W: 0, NW: 0 }
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

  for (const dir of directions) {
    const idx = Math.round(dir / 45) % 8
    bins[labels[idx]]++
  }

  let maxCount = 0
  let dominant = 'N'
  for (const [dir, count] of Object.entries(bins)) {
    if (count > maxCount) { maxCount = count; dominant = dir }
  }
  return dominant
}

/**
 * Generate lineament summary in Indonesian
 */
function generateLineamentSummary(density, direction, confidence) {
  const parts = []
  if (density > 0.3) parts.push('Kerapatan lineament TINGGI — indikasi struktur geologi aktif')
  else if (density > 0.15) parts.push('Kerapatan lineament sedang — beberapa struktur terdeteksi')
  else parts.push('Kerapatan lineament rendah — struktur minimal')

  if (direction) parts.push(`Arah dominan: ${direction}—S`)
  if (confidence > 0.6) parts.push('⚠️ Potensi struktur patahan/sesar — perlukan verifikasi lapangan')

  return parts.join('. ')
}

// ============== MATH HELPERS ==============

function getNeighbors(grid, point) {
  return grid.filter(p => {
    const dLat = Math.abs(p.lat - point.lat)
    const dLng = Math.abs(p.lng - point.lng)
    return dLat < 0.01 && dLng < 0.01 && p !== point
  })
}

function calculateSlope(point, neighbors) {
  if (neighbors.length < 2) return 0
  let maxSlope = 0
  for (const n of neighbors) {
    if (n.elevation == null || point.elevation == null) continue
    const dLat = (n.lat - point.lat) * 111000
    const dLng = (n.lng - point.lng) * 111000 * Math.cos(point.lat * Math.PI / 180)
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)
    if (dist < 1) continue
    const elevDiff = Math.abs(n.elevation - point.elevation)
    const slope = Math.atan(elevDiff / dist) * (180 / Math.PI)
    if (slope > maxSlope) maxSlope = slope
  }
  return maxSlope
}

function calculateAspect(neighbors) {
  if (neighbors.length < 2) return null
  // Simplified: average direction to neighbors with highest elevation gain
  let maxGain = 0
  let aspect = 0
  for (const n of neighbors) {
    const dLat = n.lat
    const dLng = n.lng
    const angle = Math.atan2(dLng, dLat) * (180 / Math.PI)
    const gain = n.elevation || 0
    if (gain > maxGain) { maxGain = gain; aspect = angle }
  }
  return (aspect + 360) % 360
}

function calculateCurvature(point, neighbors) {
  if (neighbors.length < 4 || point.elevation == null) return 0
  // Profile curvature: convex (+) = ridge, concave (-) = valley
  const avgElev = neighbors.reduce((s, n) => s + (n.elevation || 0), 0) / neighbors.length
  return (point.elevation - avgElev) / (avgElev || 1)
}
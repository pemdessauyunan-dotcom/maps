/**
 * Vegetation Stress Analysis Engine
 * Mendeteksi anomali vegetasi yang bisa mengindikasikan mineralisasi bawah tanah.
 * 
 * Prinsip Geobotani:
 * - Vegetasi di atas deposit mineral sering menunjukkan stress (klorosis, stunting)
 * - Logam berat dalam tanah mempengaruhi fisiologi tanaman
 * - NDVI rendah + Red Edge shift = indikasi anomali bawah permukaan
 * - Pola vegetasi linear = bisa mengikuti struktur/patahan
 * 
 * Simulasi indeks dari data elevasi + litologi (real-time, tanpa satelit)
 */

// Vegetation stress reference by rock type
const VEG_BASE = {
  volcanic: { ndvi: 0.65, ndre: 0.35, redEdge: 0.45, moisture: 0.5, health: 0.7 },
  basalt: { ndvi: 0.55, ndre: 0.3, redEdge: 0.4, moisture: 0.45, health: 0.6 },
  igneous: { ndvi: 0.6, ndre: 0.32, redEdge: 0.42, moisture: 0.48, health: 0.65 },
  sedimentary: { ndvi: 0.7, ndre: 0.38, redEdge: 0.48, moisture: 0.55, health: 0.75 },
  limestone: { ndvi: 0.5, ndre: 0.25, redEdge: 0.35, moisture: 0.35, health: 0.55 },
  sandstone: { ndvi: 0.6, ndre: 0.3, redEdge: 0.4, moisture: 0.45, health: 0.65 },
  shale: { ndvi: 0.7, ndre: 0.35, redEdge: 0.45, moisture: 0.55, health: 0.75 },
  alluvial: { ndvi: 0.75, ndre: 0.4, redEdge: 0.5, moisture: 0.6, health: 0.8 },
  metamorphic: { ndvi: 0.5, ndre: 0.25, redEdge: 0.35, moisture: 0.4, health: 0.55 },
  unknown: { ndvi: 0.6, ndre: 0.3, redEdge: 0.4, moisture: 0.45, health: 0.65 },
}

// Mineral stress signatures (how each mineral affects vegetation)
const MINERAL_VEG_STRESS = {
  gold: { stressIntensity: 0.35, ndviDrop: 0.25, redEdgeShift: 0.15, indicator: 'klorosis parah' },
  iron: { stressIntensity: 0.25, ndviDrop: 0.15, redEdgeShift: 0.1, indicator: 'pertumbuhan terhambat' },
  copper: { stressIntensity: 0.4, ndviDrop: 0.3, redEdgeShift: 0.2, indicator: 'klorosis + stunting' },
  water: { stressIntensity: -0.2, ndviDrop: 0.1, redEdgeShift: 0.05, indicator: 'vegetasi lebih hijau' },
  cavity: { stressIntensity: 0.2, ndviDrop: 0.15, redEdgeShift: 0.08, indicator: 'stress mekanis' },
  oil: { stressIntensity: 0.3, ndviDrop: 0.2, redEdgeShift: 0.12, indicator: 'hidrokarbon stress' },
  coal: { stressIntensity: 0.2, ndviDrop: 0.15, redEdgeShift: 0.08, indicator: 'acid drainage stress' },
}

/**
 * Analyze vegetation stress at a location
 * @param {number} lat
 * @param {number} lng
 * @param {Object} terrain - { elevation, slope, aspect }
 * @param {Object} geology - { rockType, mineralPotential }
 * @param {Array} anomalies - Thermal anomalies detected
 * @returns {Object} Vegetation analysis
 */
export function analyzeVegetation(lat, lng, terrain, geology, anomalies = []) {
  const elevation = terrain?.elevation || 200
  const slope = terrain?.slope || 0
  const rockType = geology?.rockType || 'unknown'
  const base = VEG_BASE[rockType] || VEG_BASE.unknown

  // Elevation effect on vegetation (lapse rate)
  const elevFactor = Math.max(0, Math.min(1, (elevation - 50) / 2000))

  // Slope effect (steeper = thinner soil = more stress)
  const slopeFactor = Math.min(slope / 45, 1)

  // Calculate base indices
  let ndvi = base.ndvi - elevFactor * 0.2 - slopeFactor * 0.15
  let ndre = base.ndre - elevFactor * 0.15 - slopeFactor * 0.1
  let redEdge = base.redEdge - elevFactor * 0.1 - slopeFactor * 0.08
  let moisture = base.moisture - elevFactor * 0.1 + slopeFactor * 0.05
  let health = base.health - elevFactor * 0.15 - slopeFactor * 0.2

  // Apply stress from detected minerals
  const stressFactors = []
  for (const anomaly of anomalies) {
    const mineralStress = MINERAL_VEG_STRESS[anomaly.type]
    if (mineralStress) {
      const stress = mineralStress.stressIntensity * anomaly.confidence
      ndvi -= mineralStress.ndviDrop * anomaly.confidence
      ndre -= mineralStress.redEdgeShift * anomaly.confidence * 0.5
      redEdge -= mineralStress.redEdgeShift * anomaly.confidence * 0.3
      health -= stress * 0.5
      stressFactors.push({
        mineral: anomaly.label,
        stressLevel: Math.abs(stress),
        indicator: mineralStress.indicator,
      })
    }
  }

  // Add deterministic variation based on coordinates
  const coordHash = Math.abs(lat * 1000 + lng * 1000) % 100 / 100
  ndvi += (coordHash - 0.5) * 0.08 * 0.5
  ndre += (coordHash * 0.7 - 0.35) * 0.06
  redEdge += (coordHash * 0.6 - 0.3) * 0.05
  moisture += (coordHash * 0.8 - 0.4) * 0.06

  // Clamp values
  ndvi = clamp(ndvi, 0.05, 0.9)
  ndre = clamp(ndre, 0.02, 0.7)
  redEdge = clamp(redEdge, 0.02, 0.65)
  moisture = clamp(moisture, 0.05, 0.85)
  health = clamp(health, 0.05, 0.95)

  // Vegetation anomaly detection
  // Low NDVI + low health = anomaly (vegetation stress)
  const expectedNdvi = base.ndvi - elevFactor * 0.2
  const ndviAnomaly = ndvi - expectedNdvi

  // Geobotanical anomaly score
  const geoBotanicalScore = Math.max(0, Math.min(1,
    (1 - ndvi / expectedNdvi) * 0.4 +
    (1 - health / 0.7) * 0.3 +
    (ndvi > 0 ? Math.max(0, (expectedNdvi - ndvi) / expectedNdvi) * 0.3 : 0)
  ))

  // Determine anomaly level
  let anomalyLevel = 'normal'
  if (geoBotanicalScore > 0.5) anomalyLevel = 'critical'
  else if (geoBotanicalScore > 0.35) anomalyLevel = 'high'
  else if (geoBotanicalScore > 0.2) anomalyLevel = 'moderate'

  // Stress pattern classification
  const stressPattern = classifyStressPattern(ndvi, ndre, redEdge, health)

  return {
    indices: {
      ndvi: parseFloat(ndvi.toFixed(3)),
      ndre: parseFloat(ndre.toFixed(3)),
      redEdge: parseFloat(redEdge.toFixed(3)),
      moisture: parseFloat(moisture.toFixed(3)),
      health: parseFloat(health.toFixed(3)),
    },
    anomaly: {
      ndviAnomaly: parseFloat(ndviAnomaly.toFixed(3)),
      geoBotanicalScore: parseFloat(geoBotanicalScore.toFixed(3)),
      level: anomalyLevel,
    },
    stressFactors: stressFactors.sort((a, b) => b.stressLevel - a.stressLevel).slice(0, 3),
    stressPattern,
    summary: generateVegetationSummary(anomalyLevel, geoBotanicalScore, stressFactors, stressPattern),
  }
}

/**
 * Classify vegetation stress pattern
 */
function classifyStressPattern(ndvi, ndre, redEdge, health) {
  if (ndvi < 0.2 && health < 0.3) return { id: 'severe_stress', label: 'Stress Berat', emoji: '🔴', desc: 'Klorosis parah, kemungkinan kontaminasi logam berat' }
  if (ndvi < 0.35 && health < 0.45) return { id: 'moderate_stress', label: 'Stress Sedang', emoji: '🟠', desc: 'Pertumbuhan terhambat, indikasi anomali bawah permukaan' }
  if (ndre < 0.2 && redEdge < 0.25) return { id: 'red_edge_shift', label: 'Red Edge Shift', emoji: '🟡', desc: 'Pergeseran red edge — indikasi stress fisiologis' }
  if (ndvi > 0.7 && health > 0.7) return { id: 'healthy', label: 'Sehat', emoji: '🟢', desc: 'Vegetasi normal, tidak ada stress signifikan' }
  if (ndvi > 0.5 && health > 0.5) return { id: 'good', label: 'Cukup Baik', emoji: '🟢', desc: 'Vegetasi dalam kondisi baik' }
  return { id: 'normal', label: 'Normal', emoji: '⚪', desc: 'Pola vegetasi normal' }
}

/**
 * Generate vegetation summary in Indonesian
 */
function generateVegetationSummary(level, score, stressFactors, pattern) {
  const parts = []
  if (level === 'critical') parts.push('⚠️ ANOMALI GEOBOTANI KRITIS — vegetasi menunjukkan stress berat')
  else if (level === 'high') parts.push('⚠️ Anomali geobotani signifikan — indikasi mineralisasi bawah permukaan')
  else if (level === 'moderate') parts.push('• Stress vegetasi moderat — perlu investigasi lanjut')
  else parts.push('✓ Vegetasi normal — tidak ada stress geobotani signifikan')

  if (stressFactors.length > 0) {
    parts.push(`Stress dari: ${stressFactors.map(s => s.mineral).join(', ')}`)
  }
  parts.push(`Pola: ${pattern.desc}`)

  return parts.join('. ')
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

export { VEG_BASE, MINERAL_VEG_STRESS }
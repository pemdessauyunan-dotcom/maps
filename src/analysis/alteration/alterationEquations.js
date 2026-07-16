/**
 * Alteration Equations — pure functions
 * Mineral alteration zone detection from spectral indices.
 */

export const ALTERATION_ZONES = {
  silicification: {
    key: 'silicification', label: 'Silisifikasi', emoji: '⚪',
    depthMin: 0, depthMax: 500, depthOptimal: 200,
    indicators: { silica_index: 0.6, iron_oxide: 0.3 },
    temp: '100-300°C',
    desc: 'Zona inti epitermal — silika tinggi, mineralisasi Au-Ag.',
  },
  argillic: {
    key: 'argillic', label: 'Argilik', emoji: '🟠',
    depthMin: 100, depthMax: 1000, depthOptimal: 400,
    indicators: { clay_minerals: 0.6, iron_oxide: 0.3 },
    temp: '200-300°C',
    desc: 'Halo alterasi — mineral lempung, pH rendah.',
  },
  propylitic: {
    key: 'propylitic', label: 'Propilitik', emoji: '🟢',
    depthMin: 500, depthMax: 2000, depthOptimal: 1000,
    indicators: { ferrous_minerals: 0.5, clay_minerals: 0.3 },
    temp: '200-400°C',
    desc: 'Zona distal — klorit, epidot, karbonat.',
  },
  potassic: {
    key: 'potassic', label: 'Potasik', emoji: '🔴',
    depthMin: 1000, depthMax: 3000, depthOptimal: 1800,
    indicators: { iron_oxide: 0.5, ferrous_minerals: 0.4 },
    temp: '400-700°C',
    desc: 'Zona inti porfiri — K-feldspar, biotit.',
  },
  silicic: {
    key: 'silicic', label: 'Silik (Vuggy)', emoji: '💎',
    depthMin: 50, depthMax: 400, depthOptimal: 150,
    indicators: { silica_index: 0.8, iron_oxide: 0.2 },
    temp: '100-200°C',
    desc: 'High-sulfidation — tekstur vuggy, mineralisasi Au-Cu.',
  },
}

/**
 * Detect alteration zone from spectral indices
 * @param {Object} indices - spectral indices
 * @param {Object} lithology - rock info
 * @returns {Object|null} Detected alteration zone
 */
export function detectAlteration(indices, lithology) {
  if (!indices) return null

  let best = null
  let bestScore = 0

  for (const zone of Object.values(ALTERATION_ZONES)) {
    let score = 0
    for (const [indicator, weight] of Object.entries(zone.indicators)) {
      if (indices[indicator] != null) {
        score += indices[indicator] * weight
      }
    }
    // Normalize
    score = score / Object.keys(zone.indicators).length

    if (score > bestScore) {
      bestScore = score
      best = { ...zone, intensity: score, confidence: Math.min(score * 1.2, 1) }
    }
  }

  return best
}

/**
 * Analyze epithermal system potential
 * @param {Object} lithology
 * @param {Object} indices
 * @param {Object} alteration
 * @returns {Object}
 */
export function analyzeEpithermal(lithology, indices, alteration) {
  const alterationName = alteration?.name || ''
  const isHighSulfidation = alterationName.includes('Silik')
  const isLowSulfidation = alterationName.includes('Silisifikasi')
  const isPorphyry = alterationName.includes('Potasik')

  const depositTypes = []
  let score = 0

  if (isHighSulfidation) {
    depositTypes.push({ type: 'High Sulfidation Epitermal', conf: 0.7 + (indices?.silica_index || 0) * 0.2 })
    score += 0.6
  }
  if (isLowSulfidation) {
    depositTypes.push({ type: 'Low Sulfidation Epitermal', conf: 0.6 + (indices?.clay_minerals || 0) * 0.2 })
    score += 0.5
  }
  if (isPorphyry) {
    depositTypes.push({ type: 'Porfiri Cu-Au', conf: 0.7 + (indices?.iron_oxide || 0) * 0.2 })
    score += 0.7
  }

  // Default: vein-type
  if (depositTypes.length === 0) {
    depositTypes.push({ type: 'Urat (Vein)', conf: 0.4 })
    score = 0.3
  }

  const potential = score > 0.4
  return {
    score: parseFloat(score.toFixed(2)),
    potential,
    depositTypes,
    recommendedExploration: potential ? 'HIGH PRIORITY' : 'MODERATE',
  }
}
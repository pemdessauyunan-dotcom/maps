/**
 * AI Multi-Source Feature Fusion — Mineral Prospectivity Model
 * 
 * Menggabungkan semua data source menjadi satu skor prospek mineral:
 * 1. Thermal anomaly (from thermalLithology)
 * 2. Spectral indices (from indonesiaGeology)
 * 3. Alteration zones (from indonesiaGeology)
 * 4. Lineament density (from lineamentAnalysis)
 * 5. Vegetation stress (from vegetationAnalysis)
 * 6. Geological potential (from geologicalApi)
 * 
 * Output: Prospectivity score + confidence + recommended action
 */

// Feature weights (tuned for Indonesia volcanic arc settings)
const FEATURE_WEIGHTS = {
  thermal: 0.20,      // Thermal anomaly (20%)
  spectral: 0.15,     // Spectral alteration indices (15%)
  alteration: 0.20,   // Alteration zone match (20%)
  lineament: 0.15,    // Lineament density (15%)
  vegetation: 0.10,   // Geobotanical anomaly (10%)
  geology: 0.20,      // Geological potential (20%)
}

// Mineral-type specific weight adjustments
const MINERAL_WEIGHTS = {
  gold: { thermal: 0.25, spectral: 0.15, alteration: 0.25, lineament: 0.15, vegetation: 0.10, geology: 0.10 },
  silver: { thermal: 0.20, spectral: 0.15, alteration: 0.25, lineament: 0.15, vegetation: 0.10, geology: 0.15 },
  copper: { thermal: 0.20, spectral: 0.15, alteration: 0.25, lineament: 0.10, vegetation: 0.10, geology: 0.20 },
  iron: { thermal: 0.25, spectral: 0.20, alteration: 0.15, lineament: 0.10, vegetation: 0.10, geology: 0.20 },
  water: { thermal: 0.30, spectral: 0.05, alteration: 0.05, lineament: 0.10, vegetation: 0.30, geology: 0.20 },
  cavity: { thermal: 0.30, spectral: 0.05, alteration: 0.05, lineament: 0.25, vegetation: 0.15, geology: 0.20 },
}

/**
 * Calculate Mineral Prospectivity Score
 * @param {Object} thermal - Thermal analysis result
 * @param {Object} spectral - Spectral indices result
 * @param {Object} alteration - Alteration zone result
 * @param {Object} lineament - Lineament analysis result
 * @param {Object} vegetation - Vegetation analysis result
 * @param {Object} geology - Geological info
 * @param {string} targetMineral - Specific mineral target (optional)
 * @returns {Object} Prospectivity assessment
 */
export function calculateProspectivity(thermal, spectral, alteration, lineament, vegetation, geology, targetMineral = null) {
  // Extract feature scores
  const features = {
    thermal: extractThermalScore(thermal),
    spectral: extractSpectralScore(spectral),
    alteration: extractAlterationScore(alteration),
    lineament: extractLineamentScore(lineament),
    vegetation: extractVegetationScore(vegetation),
    geology: extractGeologyScore(geology, thermal),
  }

  // Get weights for target mineral or use default
  const weights = targetMineral && MINERAL_WEIGHTS[targetMineral]
    ? MINERAL_WEIGHTS[targetMineral]
    : FEATURE_WEIGHTS

  // Calculate weighted score
  let totalScore = 0
  let totalWeight = 0
  const featureContributions = {}

  for (const [key, score] of Object.entries(features)) {
    const weight = weights[key] || FEATURE_WEIGHTS[key]
    featureContributions[key] = {
      score: parseFloat(score.toFixed(3)),
      weight,
      contribution: parseFloat((score * weight).toFixed(3)),
    }
    totalScore += score * weight
    totalWeight += weight
  }

  const prospectivityScore = totalWeight > 0 ? totalScore / totalWeight : 0

  // Confidence calculation
  const dataConfidence = calculateDataConfidence(features, thermal, lineament, vegetation)

  // Mineral-specific predictions
  const mineralPredictions = predictMinerals(prospectivityScore, features, thermal, geology)

  // Risk assessment
  const riskLevel = prospectivityScore > 0.6 ? 'high' : prospectivityScore > 0.4 ? 'moderate' : 'low'

  return {
    score: parseFloat(prospectivityScore.toFixed(3)),
    confidence: parseFloat(dataConfidence.toFixed(2)),
    riskLevel,
    features: featureContributions,
    mineralPredictions: mineralPredictions.slice(0, 5),
    recommendedAction: getRecommendation(prospectivityScore, dataConfidence, targetMineral),
    summary: generateProspectivitySummary(prospectivityScore, dataConfidence, riskLevel, mineralPredictions),
  }
}

function extractThermalScore(thermal) {
  if (!thermal) return 0
  const anomalyLevel = thermal.anomalyLevel || 'normal'
  const riskScore = thermal.riskScore || 0
  const anomalyCount = thermal.anomalies?.length || 0

  let score = riskScore
  if (anomalyLevel === 'critical') score += 0.2
  else if (anomalyLevel === 'high') score += 0.1
  score += Math.min(anomalyCount * 0.05, 0.15)
  return Math.min(1, score)
}

function extractSpectralScore(spectral) {
  if (!spectral || !spectral.indices) return 0
  const { alteration_index, iron_oxide, clay_minerals, silica_index } = spectral.indices
  return (alteration_index || 0) * 0.4 + (iron_oxide || 0) * 0.25 + (clay_minerals || 0) * 0.2 + (silica_index || 0) * 0.15
}

function extractAlterationScore(alteration) {
  if (!alteration) return 0
  return alteration.confidence || 0
}

function extractLineamentScore(lineament) {
  if (!lineament) return 0
  return lineament.density * 0.6 + lineament.confidence * 0.4
}

function extractVegetationScore(vegetation) {
  if (!vegetation || !vegetation.anomaly) return 0
  const { geoBotanicalScore, level } = vegetation.anomaly
  let score = geoBotanicalScore || 0
  if (level === 'critical') score += 0.15
  else if (level === 'high') score += 0.1
  return Math.min(1, score)
}

function extractGeologyScore(geology, thermal) {
  if (!geology) return 0.1
  const mineralPotential = geology.mineralPotential || []
  const confidence = geology.confidence || 0.3

  // Score based on mineral potential
  let score = 0
  for (const m of mineralPotential) {
    score += (m.probability || 0.3) * 0.15
  }
  score = Math.min(1, score + confidence * 0.3)

  // Boost if rock type matches known mineralization
  const mineralizedRocks = ['volcanic', 'andesite', 'diorite', 'igneous', 'basalt']
  if (mineralizedRocks.includes(geology.rockType)) score += 0.15

  return Math.min(1, score)
}

function calculateDataConfidence(features, thermal, lineament, vegetation) {
  let dataPoints = 0
  if (thermal && thermal.temperature) dataPoints++
  if (lineament && lineament.lineaments) dataPoints++
  if (vegetation && vegetation.indices) dataPoints++
  return Math.min(1, dataPoints / 3 + 0.3)
}

function predictMinerals(score, features, thermal, geology) {
  const predictions = []
  const mineralTypes = [
    { id: 'gold', label: 'Emas', threshold: 0.45, emoji: '🥇' },
    { id: 'copper', label: 'Tembaga', threshold: 0.4, emoji: '🔶' },
    { id: 'iron', label: 'Besi', threshold: 0.35, emoji: '⚙️' },
    { id: 'silver', label: 'Perak', threshold: 0.4, emoji: '🥈' },
    { id: 'water', label: 'Air Tanah', threshold: 0.3, emoji: '💧' },
    { id: 'cavity', label: 'Rongga/Terowongan', threshold: 0.3, emoji: '🕳️' },
    { id: 'oil', label: 'Minyak Bumi', threshold: 0.35, emoji: '🛢️' },
    { id: 'coal', label: 'Batubara', threshold: 0.3, emoji: '⬛' },
  ]

  for (const mineral of mineralTypes) {
    // Check if thermal anomalies match
    const thermalMatch = thermal?.anomalies?.find(a => a.type === mineral.id)
    const thermalConfidence = thermalMatch?.confidence || 0

    // Check if geology supports
    const geoSupport = geology?.mineralPotential?.find(m => m.type === mineral.id)
    const geoConfidence = geoSupport?.probability || 0

    // Combined score
    const mineralScore = score * 0.5 + thermalConfidence * 0.3 + geoConfidence * 0.2

    if (mineralScore > mineral.threshold * 0.5) {
      predictions.push({
        ...mineral,
        probability: parseFloat(mineralScore.toFixed(2)),
        confidence: mineralScore > mineral.threshold ? 'high' : 'moderate',
        thermalMatch: thermalConfidence > 0.3,
        geoSupport: geoConfidence > 0.3,
      })
    }
  }

  return predictions.sort((a, b) => b.probability - a.probability)
}

function getRecommendation(score, confidence, targetMineral) {
  if (score > 0.6 && confidence > 0.5) {
    return targetMineral
      ? `🔴 PRIORITAS TINGGI: Potensi ${targetMineral} tinggi. Rekomendasi survei lapangan & geokimia.`
      : '🔴 PRIORITAS TINGGI: Multi-indikator mineralisasi. Rekomendasi survei lapangan segera.'
  }
  if (score > 0.4) {
    return targetMineral
      ? `🟠 Potensi ${targetMineral} sedang. Rekomendasi: verifikasi dengan sampling tanah.`
      : '🟠 Potensi mineralisasi sedang. Rekomendasi: sampling tanah & geofisika lanjutan.'
  }
  if (score > 0.25) {
    return '🟡 Potensi rendah. Rekomendasi: eksplorasi regional skala lebih luas.'
  }
  return '⚪ Tidak ada indikasi signifikan. Area tidak prospektif.'
}

function generateProspectivitySummary(score, confidence, riskLevel, predictions) {
  const parts = []
  if (score > 0.6) parts.push('⚠️ PROSPEKTIVITAS TINGGI — area sangat prospektif')
  else if (score > 0.4) parts.push('🟠 Prospektivitas sedang — beberapa indikator positif')
  else if (score > 0.25) parts.push('🟡 Prospektivitas rendah — sedikit indikator')
  else parts.push('⚪ Tidak prospektif')

  if (predictions.length > 0) {
    parts.push(`Mineral prospek: ${predictions.slice(0, 3).map(p => `${p.emoji} ${p.label} (${(p.probability * 100).toFixed(0)}%)`).join(', ')}`)
  }
  parts.push(`Confidence: ${(confidence * 100).toFixed(0)}%`)

  return parts.join('. ')
}

export { FEATURE_WEIGHTS, MINERAL_WEIGHTS }
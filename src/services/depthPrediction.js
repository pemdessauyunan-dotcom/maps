/**
 * Depth Prediction Engine
 * Memprediksi kedalaman potensi mineral berdasarkan multi-indikator.
 * 
 * Prinsip:
 * 1. Geothermal gradient: 25-30°C/km (rata-rata Indonesia: 27°C/km)
 * 2. Zona alterasi → depth range spesifik
 * 3. Tipe deposit → depth range (epitermal dangkal, porfiri dalam)
 * 4. Thermal anomaly → korelasi dengan kedalaman sumber panas
 * 5. Lineament density → struktur dalam vs dangkal
 */

// Alteration zone depth ranges (meters)
const ALTERATION_DEPTH = {
  silicification: { min: 0, max: 500, optimal: 200, label: 'Silisifikasi', desc: 'Zona inti epitermal — dangkal' },
  argillic: { min: 100, max: 1000, optimal: 400, label: 'Argilik', desc: 'Halo alterasi — dangkal hingga moderat' },
  propylitic: { min: 500, max: 2000, optimal: 1000, label: 'Propilitik', desc: 'Zona distal — moderat' },
  potassic: { min: 1000, max: 3000, optimal: 1800, label: 'Potasik', desc: 'Zona inti porfiri — dalam' },
  silicic: { min: 50, max: 400, optimal: 150, label: 'Silik (vuggy)', desc: 'High-sulfidation — sangat dangkal' },
}

// Deposit type depth ranges
const DEPOSIT_DEPTH = {
  high_sulfidation: { min: 0, max: 500, optimal: 200, label: 'High Sulfidation Epitermal' },
  low_sulfidation: { min: 100, max: 800, optimal: 400, label: 'Low Sulfidation Epitermal' },
  porphyry: { min: 1000, max: 3000, optimal: 1500, label: 'Porfiri Cu-Au' },
  skarn: { min: 500, max: 2000, optimal: 1000, label: 'Skarn' },
  laterite: { min: 0, max: 50, optimal: 15, label: 'Laterit/Nikel' },
  vein: { min: 0, max: 1000, optimal: 300, label: 'Urat (Vein)' },
}

// Mineral depth associations
const MINERAL_DEPTH = {
  gold: { deposits: ['high_sulfidation', 'low_sulfidation', 'porphyry'], shallowOptimal: 200, deepOptimal: 1500 },
  silver: { deposits: ['high_sulfidation', 'low_sulfidation'], shallowOptimal: 300, deepOptimal: 600 },
  copper: { deposits: ['porphyry', 'skarn'], shallowOptimal: 1000, deepOptimal: 2000 },
  iron: { deposits: ['skarn', 'laterite'], shallowOptimal: 50, deepOptimal: 1000 },
  water: { deposits: [], shallowOptimal: 50, deepOptimal: 200 },
  cavity: { deposits: [], shallowOptimal: 0, deepOptimal: 100 },
}

/**
 * Predict depth of mineral potential
 * @param {Object} thermal - Thermal analysis
 * @param {Object} alteration - Alteration zone
 * @param {Object} lineament - Lineament analysis
 * @param {Object} prospectivity - Prospectivity model result
 * @param {Object} geology - Geological info
 * @returns {Object} Depth prediction
 */
export function predictDepth(thermal, alteration, lineament, prospectivity, geology) {
  // 1. Estimate from thermal anomaly
  const thermalDepth = estimateDepthFromThermal(thermal)

  // 2. Estimate from alteration zone
  const alterationDepth = estimateDepthFromAlteration(alteration)

  // 3. Estimate from lineament density
  const lineamentDepth = estimateDepthFromLineament(lineament)

  // 4. Estimate from deposit type
  const depositDepth = estimateDepthFromDeposits(prospectivity, alteration)

  // 5. Geology-based estimate
  const geologyDepth = estimateDepthFromGeology(geology)

  // Combine all estimates (weighted average)
  const estimates = [
    { ...thermalDepth, weight: 0.25 },
    { ...alterationDepth, weight: alteration ? 0.30 : 0 },
    { ...lineamentDepth, weight: 0.15 },
    { ...depositDepth, weight: prospectivity ? 0.20 : 0 },
    { ...geologyDepth, weight: 0.10 },
  ]

  const validEstimates = estimates.filter(e => e.weight > 0 && e.depth != null)
  const totalWeight = validEstimates.reduce((s, e) => s + e.weight, 0)

  let weightedDepth = 0
  let minDepth = Infinity
  let maxDepth = -Infinity

  for (const e of validEstimates) {
    weightedDepth += e.depth * e.weight
    if (e.minDepth != null && e.minDepth < minDepth) minDepth = e.minDepth
    if (e.maxDepth != null && e.maxDepth > maxDepth) maxDepth = e.maxDepth
    if (e.minDepth == null && e.depth < minDepth) minDepth = e.depth
    if (e.maxDepth == null && e.depth > maxDepth) maxDepth = e.depth
  }

  const finalDepth = totalWeight > 0 ? weightedDepth / totalWeight : null

  if (finalDepth == null) {
    return { depth: null, minDepth: null, maxDepth: null, confidence: 0, layers: [], summary: 'Data tidak cukup untuk prediksi kedalaman.' }
  }

  // Determine depth classification
  const classification = classifyDepth(finalDepth)

  // Generate depth layers
  const layers = generateDepthLayers(finalDepth, alteration, prospectivity)

  // Confidence calculation
  const confidence = calculateDepthConfidence(validEstimates, totalWeight)

  return {
    depth: Math.round(finalDepth),
    minDepth: minDepth !== Infinity ? Math.round(minDepth) : Math.round(finalDepth * 0.5),
    maxDepth: maxDepth !== -Infinity ? Math.round(maxDepth) : Math.round(finalDepth * 1.5),
    confidence: parseFloat(confidence.toFixed(2)),
    classification,
    layers,
    summary: generateDepthSummary(finalDepth, classification, confidence),
    recommendedExploration: getDepthRecommendation(finalDepth, classification),
  }
}

function estimateDepthFromThermal(thermal) {
  if (!thermal || !thermal.temperature) return { depth: null, minDepth: null, maxDepth: null }

  const surfaceTemp = thermal.temperature.surface || 30
  const anomaly = thermal.temperature.anomaly || 0
  const rockType = thermal.lithology?.rockType || 'unknown'

  // Geothermal gradient: 27°C/km (Indonesia average)
  const gradient = 27
  const ambientTemp = 28 // Average surface temperature
  const tempDiff = surfaceTemp - ambientTemp

  // Positive anomaly = heat source closer to surface
  // Negative anomaly = cold body (water, cavity) near surface
  let depth = null
  let minDepth = null
  let maxDepth = null

  if (Math.abs(anomaly) > 0.5) {
    // Strong anomaly = shallow source
    depth = Math.max(10, (gradient * 1000) / Math.abs(anomaly * 10))
    depth = Math.min(depth, 2000)
    minDepth = Math.max(5, depth * 0.3)
    maxDepth = Math.min(3000, depth * 2)
  } else {
    // Weak or no anomaly = deep source or no source
    depth = 500
    minDepth = 100
    maxDepth = 2000
  }

  // Adjust for rock type thermal conductivity
  const conductivityFactors = {
    igneous: 0.8, granite: 0.7, basalt: 0.9,
    volcanic: 0.85, sedimentary: 1.2, sandstone: 1.1,
    limestone: 1.3, metamorphic: 0.9, alluvial: 1.5,
  }
  const factor = conductivityFactors[rockType] || 1.0
  depth = depth * factor

  return { depth, minDepth, maxDepth }
}

function estimateDepthFromAlteration(alteration) {
  if (!alteration) return { depth: null, minDepth: null, maxDepth: null }

  // Map alteration name to key
  const nameMap = {
    'Silisifikasi': 'silicification',
    'Argilik': 'argillic',
    'Propilitik': 'propylitic',
    'Potasik': 'potassic',
    'Silik': 'silicic',
  }

  const key = nameMap[alteration.name] || Object.keys(ALTERATION_DEPTH).find(
    k => alteration.name?.toLowerCase().includes(k)
  )

  if (!key || !ALTERATION_DEPTH[key]) {
    return { depth: 500, minDepth: 0, maxDepth: 2000 }
  }

  const depthInfo = ALTERATION_DEPTH[key]
  return {
    depth: depthInfo.optimal,
    minDepth: depthInfo.min,
    maxDepth: depthInfo.max,
    alterationZone: depthInfo,
  }
}

function estimateDepthFromLineament(lineament) {
  if (!lineament || !lineament.lineaments || lineament.lineaments.length === 0) {
    return { depth: 500, minDepth: 100, maxDepth: 2000 }
  }

  // High density lineament = shallow structures
  // Low density = deep structures
  const density = lineament.density || 0
  const confidence = lineament.confidence || 0

  // Deep structures (low density, high confidence) = deeper
  // Shallow structures (high density) = shallower
  let depth = 500
  let minDepth = 100
  let maxDepth = 2000

  if (density > 0.3 && confidence > 0.5) {
    depth = 200 // Dense shallow structures
    minDepth = 50
    maxDepth = 800
  } else if (density > 0.15) {
    depth = 400
    minDepth = 100
    maxDepth = 1500
  } else if (confidence > 0.5) {
    depth = 800 // Deep structures
    minDepth = 300
    maxDepth = 2500
  }

  return { depth, minDepth, maxDepth }
}

function estimateDepthFromDeposits(prospectivity, alteration) {
  if (!prospectivity || !prospectivity.mineralPredictions || prospectivity.mineralPredictions.length === 0) {
    return { depth: null, minDepth: null, maxDepth: null }
  }

  const topMineral = prospectivity.mineralPredictions[0]
  const mineralInfo = MINERAL_DEPTH[topMineral.id]
  if (!mineralInfo) return { depth: 500, minDepth: 100, maxDepth: 2000 }

  // Check if alteration matches
  const alterationName = alteration?.name || ''
  const isEpithermal = alterationName.includes('Silisifikasi') || alterationName.includes('Argilik')
  const isPorphyry = alterationName.includes('Potasik')

  let depth, minDepth, maxDepth
  if (isEpithermal) {
    depth = mineralInfo.shallowOptimal
    minDepth = 0
    maxDepth = 800
  } else if (isPorphyry) {
    depth = mineralInfo.deepOptimal
    minDepth = 1000
    maxDepth = 3000
  } else {
    depth = (mineralInfo.shallowOptimal + mineralInfo.deepOptimal) / 2
    minDepth = Math.min(mineralInfo.shallowOptimal, mineralInfo.deepOptimal) * 0.5
    maxDepth = Math.max(mineralInfo.shallowOptimal, mineralInfo.deepOptimal) * 1.5
  }

  return { depth, minDepth, maxDepth }
}

function estimateDepthFromGeology(geology) {
  if (!geology) return { depth: 500, minDepth: 100, maxDepth: 2000 }

  const rockType = geology.rockType || 'unknown'
  const depthMap = {
    volcanic: { depth: 300, min: 50, max: 1500 },
    igneous: { depth: 500, min: 100, max: 2000 },
    basalt: { depth: 400, min: 100, max: 1500 },
    sedimentary: { depth: 600, min: 100, max: 2500 },
    limestone: { depth: 400, min: 50, max: 1500 },
    sandstone: { depth: 500, min: 100, max: 2000 },
    shale: { depth: 700, min: 200, max: 2500 },
    metamorphic: { depth: 800, min: 200, max: 3000 },
    alluvial: { depth: 50, min: 0, max: 200 },
  }

  const info = depthMap[rockType] || { depth: 500, min: 100, max: 2000 }
  return { depth: info.depth, minDepth: info.min, maxDepth: info.max }
}

function classifyDepth(depth) {
  if (depth < 100) return { id: 'very_shallow', label: 'Sangat Dangkal', emoji: '🟢', range: '0-100m', desc: 'Permukaan hingga 100m' }
  if (depth < 300) return { id: 'shallow', label: 'Dangkal', emoji: '🟡', range: '100-300m', desc: 'Zona epitermal & laterit' }
  if (depth < 800) return { id: 'moderate', label: 'Moderat', emoji: '🟠', range: '300-800m', desc: 'Zona transisi epitermal-porfiri' }
  if (depth < 1500) return { id: 'deep', label: 'Dalam', emoji: '🔴', range: '800-1500m', desc: 'Zona porfiri & skarn' }
  return { id: 'very_deep', label: 'Sangat Dalam', emoji: '🟣', range: '>1500m', desc: 'Zona porfiri dalam & basement' }
}

function generateDepthLayers(depth, alteration, prospectivity) {
  const layers = []
  const step = Math.max(50, Math.round(depth / 5 / 50) * 50)

  for (let d = 0; d <= depth + step; d += step) {
    const ratio = d / depth
    let label, emoji, intensity

    if (ratio < 0.2) {
      label = 'Zone Permukaan'
      emoji = '🟢'
      intensity = 0.2
    } else if (ratio < 0.4) {
      label = 'Zone Dangkal'
      emoji = '🟡'
      intensity = 0.4
    } else if (ratio < 0.6) {
      label = 'Zone Transisi'
      emoji = '🟠'
      intensity = 0.6
    } else if (ratio < 0.8) {
      label = 'Zone Dalam'
      emoji = '🔴'
      intensity = 0.8
    } else {
      label = 'Zone Sangat Dalam'
      emoji = '🟣'
      intensity = 1.0
    }

    // Check if alteration matches this depth
    let alterationMatch = null
    if (alteration) {
      for (const [, info] of Object.entries(ALTERATION_DEPTH)) {
        if (d >= info.min && d <= info.max) {
          alterationMatch = { zone: info.label, optimal: d >= info.optimal - 50 && d <= info.optimal + 50 }
        }
      }
    }

    layers.push({
      depth: d,
      label,
      emoji,
      intensity,
      alterationMatch,
    })
  }

  return layers
}

function calculateDepthConfidence(estimates, totalWeight) {
  let confidence = 0
  confidence += Math.min(totalWeight / 1.0, 1) * 0.5
  confidence += estimates.filter(e => e.depth != null).length / 5 * 0.3
  confidence += estimates.some(e => e.alterationZone) ? 0.2 : 0
  return Math.min(1, confidence)
}

function generateDepthSummary(depth, classification, confidence) {
  return `Prediksi kedalaman potensi: ${depth}m (${classification.range}). ${classification.desc}. Confidence: ${(confidence * 100).toFixed(0)}%.`
}

function getDepthRecommendation(depth, classification) {
  const recs = {
    very_shallow: '🔵 Rekomendasi: Test pit / Auger drilling (0-100m)',
    shallow: '🟡 Rekomendasi: Diamond drilling HQ (100-300m)',
    moderate: '🟠 Rekomendasi: Diamond drilling NQ (300-800m)',
    deep: '🔴 Rekomendasi: Diamond drilling NQ/BQ (800-1500m)',
    very_deep: '🟣 Rekomendasi: Deep diamond drilling BQ (>1500m)',
  }
  return recs[classification.id] || 'Rekomendasi: Konsultasi dengan geologist.'
}

export { ALTERATION_DEPTH, DEPOSIT_DEPTH, MINERAL_DEPTH }
/**
 * Shallow Depth Prediction Engine (1-50m)
 * Untuk survey lapangan — deteksi rongga, air tanah, urat dangkal, terowongan.
 * 
 * Prinsip Shallow Survey:
 * 1. Thermal anomaly → hotspot/coldspot dekat permukaan (0-20m)
 * 2. Anomali besar (>3°C) = sumber sangat dangkal (<5m)
 * 3. Anomali kecil (1-2°C) = sumber agak dalam (20-50m)
 * 4. Anomali negatif = rongga/air (0-30m)
 * 5. Kerapatan lineament = struktur permukaan (0-20m)
 * 6. Jenis anomali = target spesifik (cavity, water, vein, etc)
 */

// Shallow target depth ranges (meters)
const SHALLOW_TARGETS = {
  cavity: { min: 0, max: 15, optimal: 5, label: 'Rongga/Terowongan', emoji: '🕳️', desc: 'Rongga bawah tanah, gua, terowongan' },
  water: { min: 2, max: 40, optimal: 15, label: 'Air Tanah', emoji: '💧', desc: 'Akuifer dangkal, aliran air tanah' },
  vein: { min: 5, max: 50, optimal: 25, label: 'Urat Mineral', emoji: '💎', desc: 'Urat kuarsa, mineralisasi dangkal' },
  hot_spring: { min: 0, max: 30, optimal: 10, label: 'Sumber Air Panas', emoji: '♨️', desc: 'Manifestasi hidrotermal permukaan' },
  clay: { min: 1, max: 30, optimal: 10, label: 'Zona Lempung', emoji: '🧱', desc: 'Alterasi lempung, impermeable layer' },
  bedrock: { min: 10, max: 50, optimal: 30, label: 'Batuan Dasar', emoji: '🪨', desc: 'Kontak soil-bedrock, pelapisan' },
}

// Rock type → shallow soil/bedrock depth
const SOIL_DEPTH = {
  alluvial: { depth: 15, min: 5, max: 40, label: 'Aluvial — soil dalam' },
  sedimentary: { depth: 10, min: 3, max: 30, label: 'Sedimen — soil moderat' },
  sandstone: { depth: 8, min: 2, max: 25, label: 'Batu Pasir — soil tipis' },
  limestone: { depth: 20, min: 5, max: 50, label: 'Batu Kapur — soil dalam + karst' },
  volcanic: { depth: 5, min: 1, max: 20, label: 'Vulkanik — soil tipis, batuan keras' },
  igneous: { depth: 3, min: 1, max: 15, label: 'Beku — soil sangat tipis' },
  basalt: { depth: 4, min: 1, max: 12, label: 'Basalt — soil tipis' },
  metamorphic: { depth: 6, min: 2, max: 20, label: 'Metamorf — soil tipis-moderat' },
}

/**
 * Predict shallow depth (1-50m) of target
 * @param {Object} thermal - Thermal analysis
 * @param {Object} alteration - Alteration zone
 * @param {Object} lineament - Lineament analysis
 * @param {Object} prospectivity - Prospectivity model result
 * @param {Object} geology - Geological info
 * @returns {Object} Shallow depth prediction
 */
export function predictDepth(thermal, alteration, lineament, prospectivity, geology) {
  // 1. Thermal anomaly → shallow depth
  const thermalDepth = estimateFromThermal(thermal)

  // 2. Anomaly type → target identification
  const targetDepth = identifyTarget(thermal, alteration, prospectivity)

  // 3. Lineament → shallow structure
  const lineamentDepth = estimateFromLineament(lineament)

  // 4. Rock type → soil/bedrock depth
  const rockDepth = estimateFromRockType(geology)

  // Combine estimates (weighted)
  const estimates = [
    { ...thermalDepth, weight: 0.35 },
    { ...targetDepth, weight: targetDepth ? 0.30 : 0 },
    { ...lineamentDepth, weight: 0.15 },
    { ...rockDepth, weight: 0.20 },
  ]

  const valid = estimates.filter(e => e.weight > 0 && e.depth != null)
  const totalWeight = valid.reduce((s, e) => s + e.weight, 0)

  let depth = 0, minD = Infinity, maxD = -Infinity
  for (const e of valid) {
    depth += e.depth * e.weight
    if (e.minDepth != null && e.minDepth < minD) minD = e.minDepth
    if (e.maxDepth != null && e.maxDepth > maxD) maxD = e.maxDepth
  }
  const finalDepth = totalWeight > 0 ? Math.round(depth / totalWeight) : 10

  // Clamp to 1-50m
  const clamped = Math.max(1, Math.min(50, finalDepth))
  const minClamped = Math.max(0, minD !== Infinity ? Math.round(minD) : 1)
  const maxClamped = Math.min(50, maxD !== -Infinity ? Math.round(maxD) : 50)

  // Target identification
  const target = targetDepth?.target || identifyTargetFallback(thermal, prospectivity)

  // Classification
  const classification = classifyDepth(clamped)
  const layers = generateLayers(clamped, target)
  const confidence = calcConfidence(valid, totalWeight, thermal)

  return {
    depth: clamped,
    minDepth: Math.max(0, clamped - 5),
    maxDepth: Math.min(50, clamped + 8),
    confidence: parseFloat(confidence.toFixed(2)),
    target,
    classification,
    layers,
    summary: `Prediksi kedalaman: ${clamped}m (${classification.range}). Target: ${target.emoji} ${target.label}. ${classification.desc}`,
    recommendedAction: getRecommendation(clamped, target),
  }
}

// ===== ESTIMATORS =====

function estimateFromThermal(thermal) {
  if (!thermal?.temperature) return { depth: 15, minDepth: 5, maxDepth: 40 }

  const anomaly = Math.abs(thermal.temperature.anomaly || 0)
  const isNegative = (thermal.temperature.anomaly || 0) < 0

  // Negative anomaly = cold body (cavity, water) — very shallow
  if (isNegative && anomaly > 1) {
    return { depth: Math.max(1, 15 - anomaly * 3), minDepth: 0, maxDepth: 25 }
  }

  // Strong positive anomaly = hot source near surface
  if (anomaly > 4) return { depth: Math.max(1, 3), minDepth: 0, maxDepth: 8 }
  if (anomaly > 3) return { depth: Math.max(1, 5), minDepth: 1, maxDepth: 12 }
  if (anomaly > 2) return { depth: Math.max(1, 10), minDepth: 3, maxDepth: 20 }
  if (anomaly > 1) return { depth: Math.max(1, 18), minDepth: 5, maxDepth: 35 }

  return { depth: 25, minDepth: 10, maxDepth: 50 }
}

function identifyTarget(thermal, alteration, prospectivity) {
  // Cavity detection: negative anomaly + no alteration
  if (thermal?.temperature?.anomaly < -2) {
    return { ...SHALLOW_TARGETS.cavity, depth: 5, minDepth: 0, maxDepth: 15 }
  }

  // Hot spring: high positive anomaly + volcanic rock
  if (thermal?.temperature?.anomaly > 3 && thermal?.lithology?.rockType === 'volcanic') {
    return { ...SHALLOW_TARGETS.hot_spring, depth: 8, minDepth: 0, maxDepth: 25 }
  }

  // Vein: prospectivity predicts gold/silver + alteration present
  if (prospectivity?.mineralPredictions?.some(p => ['gold', 'silver', 'copper'].includes(p.id))) {
    if (alteration) {
      return { ...SHALLOW_TARGETS.vein, depth: 20, minDepth: 5, maxDepth: 45 }
    }
  }

  // Clay zone: alteration detected but no strong anomaly
  if (alteration && Math.abs(thermal?.temperature?.anomaly || 0) < 2) {
    return { ...SHALLOW_TARGETS.clay, depth: 10, minDepth: 2, maxDepth: 25 }
  }

  // Water: sedimentary rock + no anomaly
  if (thermal?.lithology?.rockType === 'sedimentary' || thermal?.lithology?.rockType === 'alluvial') {
    return { ...SHALLOW_TARGETS.water, depth: 12, minDepth: 3, maxDepth: 35 }
  }

  return null
}

function identifyTargetFallback(thermal, prospectivity) {
  if (thermal?.temperature?.anomaly < -1) return SHALLOW_TARGETS.cavity
  if (thermal?.temperature?.anomaly > 2) return SHALLOW_TARGETS.hot_spring
  if (prospectivity?.mineralPredictions?.length > 0) return SHALLOW_TARGETS.vein
  return SHALLOW_TARGETS.bedrock
}

function estimateFromLineament(lineament) {
  if (!lineament?.lineaments || lineament.lineaments.length === 0) {
    return { depth: 20, minDepth: 5, maxDepth: 45 }
  }

  const density = lineament.density || 0
  const conf = lineament.confidence || 0

  // Dense lineament = shallow fractures
  if (density > 0.3 && conf > 0.5) return { depth: 5, minDepth: 1, maxDepth: 15 }
  if (density > 0.15) return { depth: 12, minDepth: 3, maxDepth: 25 }
  if (conf > 0.5) return { depth: 20, minDepth: 8, maxDepth: 40 }

  return { depth: 25, minDepth: 10, maxDepth: 50 }
}

function estimateFromRockType(geology) {
  if (!geology?.rockType) return { depth: 10, minDepth: 3, maxDepth: 30 }

  const info = SOIL_DEPTH[geology.rockType] || SOIL_DEPTH.sedimentary
  return { depth: info.depth, minDepth: info.min, maxDepth: info.max }
}

// ===== CLASSIFICATION =====

function classifyDepth(depth) {
  if (depth <= 5) return { id: 'surface', label: 'Permukaan', emoji: '🟢', range: '0-5m', desc: 'Sangat dekat permukaan' }
  if (depth <= 15) return { id: 'shallow', label: 'Dangkal', emoji: '🟡', range: '5-15m', desc: 'Zona dangkal, mudah dijangkau' }
  if (depth <= 30) return { id: 'moderate', label: 'Moderat', emoji: '🟠', range: '15-30m', desc: 'Zona moderat, perlu bor' }
  return { id: 'deep_shallow', label: 'Dalam (Shallow)', emoji: '🔴', range: '30-50m', desc: 'Zona dalam shallow survey' }
}

// ===== LAYERS =====

function generateLayers(depth, target) {
  const layers = []
  const step = Math.max(2, Math.round(depth / 5))

  for (let d = 0; d <= depth + step; d += step) {
    const ratio = d / depth
    let label, emoji
    if (ratio < 0.2) { label = 'Permukaan'; emoji = '🟢' }
    else if (ratio < 0.4) { label = 'Subsurface'; emoji = '🟡' }
    else if (ratio < 0.6) { label = 'Zona Target'; emoji = '🟠' }
    else if (ratio < 0.8) { label = 'Dalam'; emoji = '🔴' }
    else { label = 'Batuan Dasar'; emoji = '🟣' }

    const isTarget = target && d >= target.optimal - 3 && d <= target.optimal + 3

    layers.push({
      depth: d,
      label,
      emoji,
      isTarget,
      targetLabel: isTarget ? target.emoji + ' ' + target.label : null,
    })
  }
  return layers
}

// ===== CONFIDENCE =====

function calcConfidence(valid, totalWeight, thermal) {
  let c = 0
  c += Math.min(totalWeight / 1.0, 1) * 0.4
  c += valid.length / 4 * 0.3
  c += Math.abs(thermal?.temperature?.anomaly || 0) / 5 * 0.3
  return Math.min(1, parseFloat(c.toFixed(2)))
}

// ===== RECOMMENDATION =====

function getRecommendation(depth, target) {
  const recs = {
    surface: '🔵 Test pit / Hand auger (0-5m)',
    shallow: '🟡 Hand auger / Portable drill (5-15m)',
    moderate: '🟠 Portable coring drill (15-30m)',
    deep_shallow: '🔴 Small drilling rig (30-50m)',
  }
  const base = recs[classifyDepth(depth).id] || '🔵 Test pit'

  if (target) {
    if (target.key === 'cavity') return '🕳️ ' + base + ' — Cari rongga/terowongan'
    if (target.key === 'water') return '💧 ' + base + ' — Uji akuifer dangkal'
    if (target.key === 'vein') return '💎 ' + base + ' — Sampling urat mineral'
    if (target.key === 'hot_spring') return '♨️ ' + base + ' — Cek manifestasi panas bumi'
  }
  return base
}

export { SHALLOW_TARGETS, SOIL_DEPTH }
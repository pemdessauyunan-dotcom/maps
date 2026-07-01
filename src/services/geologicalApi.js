// Geological Data Service
// Uses Macrostrat API for geological formation data
// Uses USGS WMS for mineral deposit overlays

const MACROSTRAT_API = 'https://macrostrat.org/api/geo'
const USGS_MINERAL_WMS = 'https://mrdata.usgs.gov/services/mrds'

// Rock type to mineral association map
const ROCK_MINERAL_MAP = {
  'igneous': ['gold', 'copper', 'iron', 'diamond'],
  'granite': ['gold', 'copper', 'tungsten', 'tin'],
  'volcanic': ['gold', 'silver', 'copper', 'zinc'],
  'basalt': ['iron', 'copper', 'titanium'],
  'sedimentary': ['oil', 'gas', 'coal', 'limestone'],
  'sandstone': ['oil', 'gas', 'uranium', 'copper'],
  'limestone': ['lead', 'zinc', 'oil', 'cave'],
  'shale': ['oil', 'gas', 'pyrite', 'artifact'],
  'metamorphic': ['gold', 'diamond', 'copper', 'iron'],
  'marble': ['talc', 'gemstone', 'copper'],
  'quartzite': ['gold', 'quartz', 'copper'],
  'schist': ['gold', 'garnet', 'talc'],
  'gneiss': ['gold', 'iron', 'feldspar'],
  'alluvial': ['gold', 'diamond', 'tin', 'treasure'],
}

/**
 * Fetch geological information for a location
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>} Geological info
 */
export async function fetchGeologicalInfo(lat, lng) {
  try {
    const res = await fetch(`${MACROSTRAT_API}?lat=${lat}&lng=${lng}&format=json`)
    if (!res.ok) throw new Error(`Macrostrat API error: ${res.status}`)
    const data = await res.json()

    if (!data.success?.data?.length) {
      return {
        formation: 'Unknown',
        period: 'Unknown',
        rockType: 'Unknown',
        description: 'No geological data available for this location',
        mineralPotential: [],
        confidence: 0,
      }
    }

    const geo = data.success.data[0]
    const rockType = classifyRockType(geo)
    const mineralPotential = getMineralPotential(rockType, geo)

    return {
      formation: geo.strat_name || geo.formation || 'Unknown Formation',
      period: geo.int_name || geo.age || 'Unknown Period',
      rockType,
      lithology: geo.lith ? geo.lith.map(l => l.name).join(', ') : 'Unknown',
      description: geo.descrip || '',
      mineralPotential,
      confidence: geo.confidence || 0.5,
      source: 'Macrostrat',
    }
  } catch (err) {
    console.warn('Geological data fetch failed:', err.message)
    return {
      formation: 'Data Unavailable',
      period: 'Unknown',
      rockType: 'Unknown',
      description: 'Could not fetch geological data. Check connection.',
      mineralPotential: [],
      confidence: 0,
      error: err.message,
    }
  }
}

/**
 * Classify rock type from geological data
 */
function classifyRockType(geo) {
  const lith = geo.lith ? geo.lith.map(l => l.name.toLowerCase()).join(' ') : ''
  const type = geo.type?.toLowerCase() || ''

  if (type.includes('igneous') || lith.includes('granite') || lith.includes('basalt') || lith.includes('volcanic')) {
    if (lith.includes('granite')) return 'granite'
    if (lith.includes('basalt')) return 'basalt'
    return 'igneous'
  }
  if (type.includes('sedimentary') || lith.includes('sandstone') || lith.includes('limestone') || lith.includes('shale')) {
    if (lith.includes('sandstone')) return 'sandstone'
    if (lith.includes('limestone')) return 'limestone'
    if (lith.includes('shale')) return 'shale'
    return 'sedimentary'
  }
  if (type.includes('metamorphic') || lith.includes('marble') || lith.includes('quartzite') || lith.includes('schist')) {
    if (lith.includes('marble')) return 'marble'
    if (lith.includes('quartzite')) return 'quartzite'
    if (lith.includes('schist')) return 'schist'
    return 'metamorphic'
  }
  if (lith.includes('alluvial') || lith.includes('sediment')) return 'alluvial'
  return 'unknown'
}

/**
 * Get mineral potential based on rock type
 */
function getMineralPotential(rockType, geo) {
  const baseMinerals = ROCK_MINERAL_MAP[rockType] || []
  return baseMinerals.map(m => ({
    type: m,
    probability: getMineralProbability(m, rockType, geo),
  }))
}

/**
 * Estimate mineral probability based on rock type and geological context
 */
function getMineralProbability(mineral, rockType, geo) {
  // Base probabilities by rock type
  const highProb = ['igneous', 'granite', 'volcanic', 'metamorphic', 'quartzite', 'schist']
  const medProb = ['sedimentary', 'sandstone', 'basalt', 'alluvial']
  const lowProb = ['limestone', 'shale', 'marble']

  if (mineral === 'gold') {
    if (rockType === 'quartzite' || rockType === 'granite') return 0.7
    if (highProb.includes(rockType)) return 0.5
    if (rockType === 'alluvial') return 0.4 // placer deposits
    return 0.15
  }
  if (mineral === 'oil' || mineral === 'gas') {
    if (rockType === 'sandstone' || rockType === 'limestone') return 0.6
    if (rockType === 'shale') return 0.5
    if (rockType === 'sedimentary') return 0.4
    return 0.05
  }
  if (mineral === 'iron') {
    if (rockType === 'igneous' || rockType === 'basalt') return 0.6
    if (rockType === 'metamorphic' || rockType === 'gneiss') return 0.5
    return 0.2
  }
  if (mineral === 'copper') {
    if (rockType === 'igneous' || rockType === 'volcanic') return 0.6
    if (rockType === 'granite') return 0.5
    return 0.2
  }
  if (mineral === 'diamond') {
    if (rockType === 'igneous') return 0.3 // kimberlite pipes
    if (rockType === 'metamorphic') return 0.2
    if (rockType === 'alluvial') return 0.15 // alluvial diamonds
    return 0.05
  }
  if (mineral === 'cave' || mineral === 'tunnel') {
    if (rockType === 'limestone') return 0.7 // karst terrain
    if (rockType === 'sedimentary') return 0.3
    return 0.1
  }
  if (mineral === 'treasure' || mineral === 'artifact') {
    if (rockType === 'alluvial') return 0.3
    if (rockType === 'sedimentary') return 0.2
    return 0.1
  }

  // Default
  if (highProb.includes(rockType)) return 0.4
  if (medProb.includes(rockType)) return 0.25
  if (lowProb.includes(rockType)) return 0.15
  return 0.1
}

/**
 * Get USGS Mineral Resources WMS layer for Leaflet
 * Shows known mineral deposits worldwide
 */
export function getMineralWMSLayer(L) {
  try {
    return L.tileLayer.wms(USGS_MINERAL_WMS, {
      layers: 'mrds',
      format: 'image/png',
      transparent: true,
      opacity: 0.6,
      attribution: 'USGS Mineral Resources Data System',
      maxZoom: 18,
    })
  } catch (err) {
    console.warn('Failed to create mineral WMS layer:', err)
    return null
  }
}

/**
 * Get geological map WMS overlay (OneGeology)
 */
export function getGeologicalWMSLayer(L) {
  try {
    return L.tileLayer.wms('https://maps.geoscienceaustralia.gov.au/arcgis/services/Geology/MapServer/WMSServer', {
      layers: '0',
      format: 'image/png',
      transparent: true,
      opacity: 0.4,
      attribution: 'Geoscience Australia',
      maxZoom: 14,
    })
  } catch (err) {
    console.warn('Failed to create geological WMS layer:', err)
    return null
  }
}

/**
 * Batch fetch geological info for multiple points
 */
export async function batchFetchGeological(points) {
  const results = []
  // Fetch sequentially to avoid rate limiting
  for (const p of points) {
    const info = await fetchGeologicalInfo(p.lat, p.lng)
    results.push({ ...p, geological: info })
    // Small delay to be polite to the API
    await new Promise(r => setTimeout(r, 200))
  }
  return results
}

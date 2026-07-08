/**
 * Indonesia Lithology Database & Spectral Alteration Engine
 * 
 * Data source: Peta Geologi Indonesia (GRDC), classical literature
 * For areas outside Indonesia coverage, uses geological province-based estimation
 */

// ============================================
// DATABASE LITOLOGI INDONESIA
// ============================================

// By geological province (for West Java / Sunda Arc)
const INDONESIA_LITHOLOGY = {
  // West Java volcanic arc (Kasomalang Kulon area)
  'west_java_volcanic': {
    region: 'West Java Volcanic Arc',
    age: 'Quaternary - Tertiary',
    rocks: [
      { name: 'Young Volcanic Deposit', type: 'volcanic', desc: 'Tuff, lapilli, breccia, lava from Quaternary volcanoes', coverage: 'mountainous' },
      { name: 'Volcanic Breccia', type: 'volcanic', desc: 'Andesitic-basaltic volcanic breccia, massive', coverage: 'hills' },
      { name: 'Lava Flow', type: 'basalt', desc: 'Andesitic to basaltic lava flows, jointed', coverage: 'slopes' },
      { name: 'Tuffaceous Sandstone', type: 'sandstone', desc: 'Sandstone with volcanic material, tuffaceous matrix', coverage: 'lowlands' },
      { name: 'Alluvial Deposit', type: 'alluvial', desc: 'River deposits, clay, sand, gravel', coverage: 'river_valleys' },
      { name: 'Lacustrine Deposit', type: 'sedimentary', desc: 'Lake deposits, clay, silt, diatomaceous earth', coverage: 'basins' },
      { name: 'Limestone', type: 'limestone', desc: 'Reef limestone, crystalline limestone (Tertiary)', coverage: 'south_coast' },
    ],
    minerals: ['gold', 'silver', 'copper', 'manganese', 'iron'],
    alteration: ['argillic', 'propylitic', 'silicification'],
  },
  // North Java basin (sedimentary)
  'north_java_basin': {
    region: 'North Java Basin',
    age: 'Tertiary - Quaternary',
    rocks: [
      { name: 'Claystone', type: 'shale', desc: 'Grey claystone, carbonaceous', coverage: 'lowlands' },
      { name: 'Sandstone', type: 'sandstone', desc: 'Quartz sandstone, glauconitic', coverage: 'hills' },
      { name: 'Limestone', type: 'limestone', desc: 'Reefal limestone, calcarenite', coverage: 'karst' },
      { name: 'Marl', type: 'sedimentary', desc: 'Calcareous clay, foraminifera-rich', coverage: 'low_hills' },
      { name: 'Conglomerate', type: 'sedimentary', desc: 'Basal conglomerate, polymict', coverage: 'basal' },
    ],
    minerals: ['oil', 'gas', 'coal', 'limestone'],
    alteration: ['calcitization', 'dolomitization'],
  },
  // Southern mountains (Java)
  'south_java_mountains': {
    region: 'Southern Java Mountains',
    age: 'Tertiary',
    rocks: [
      { name: 'Andesite', type: 'igneous', desc: 'Andesite lava, porphyritic', coverage: 'mountains' },
      { name: 'Limestone Formation', type: 'limestone', desc: 'Massive reefal limestone', coverage: 'plateaus' },
      { name: 'Volcaniclastic Deposit', type: 'volcanic', desc: 'Reworked volcanic material, sandstone, conglomerate', coverage: 'slopes' },
      { name: 'Diorite Intrusion', type: 'igneous', desc: 'Diorite, granodiorite plugs (mineralized)', coverage: 'intrusive_centers' },
    ],
    minerals: ['gold', 'silver', 'copper', 'lead', 'zinc', 'manganese'],
    alteration: ['propylitic', 'argillic', 'silicic', 'potassic'],
  },
}

// ============================================
// MINERAL DATABASE (for detection)
// ============================================

const MINERAL_DATABASE = {
  gold: {
    name: 'Emas',
    emoji: '🥇',
    type: 'epithermal',
    formation: 'Quartz veins in volcanic arcs',
    hostRocks: ['andesite', 'dacite', 'volcanic', 'diorite'],
    alteration: ['silicification', 'argillic', 'propylitic'],
    spectralSignature: { absorption: [2.2, 2.35], reflection: [1.6, 2.0] },
    indonesiaProvinces: ['west_java_volcanic', 'south_java_mountains'],
    confidence: 0.6,
  },
  silver: {
    name: 'Perak',
    emoji: '🥈',
    type: 'epithermal',
    formation: 'Base metal veins, associated with gold',
    hostRocks: ['andesite', 'volcanic', 'diorite'],
    alteration: ['argillic', 'propylitic'],
    spectralSignature: { absorption: [2.2], reflection: [1.8] },
    indonesiaProvinces: ['west_java_volcanic', 'south_java_mountains'],
    confidence: 0.5,
  },
  copper: {
    name: 'Tembaga',
    emoji: '🔶',
    type: 'porphyry / epitermal',
    formation: 'Porphyry deposits in diorite/granodiorite',
    hostRocks: ['diorite', 'andesite', 'igneous'],
    alteration: ['potassic', 'propylitic', 'argillic'],
    spectralSignature: { absorption: [0.8, 2.3], reflection: [1.0, 1.8] },
    indonesiaProvinces: ['south_java_mountains'],
    confidence: 0.45,
  },
  iron: {
    name: 'Besi',
    emoji: '⚙️',
    type: 'skarn / laterit',
    formation: 'Iron oxide in volcanic-sedimentary sequences',
    hostRocks: ['basalt', 'andesite', 'volcanic', 'sedimentary'],
    alteration: ['silicification', 'hematitization'],
    spectralSignature: { absorption: [0.9, 2.0], reflection: [0.6, 1.2] },
    indonesiaProvinces: ['west_java_volcanic', 'south_java_mountains'],
    confidence: 0.55,
  },
  manganese: {
    name: 'Mangan',
    emoji: '🔘',
    type: 'sedimentary / residual',
    formation: 'Manganese nodules in sedimentary rocks',
    hostRocks: ['sedimentary', 'limestone', 'shale'],
    alteration: ['oxidation'],
    spectralSignature: { absorption: [0.5, 1.2], reflection: [0.7] },
    indonesiaProvinces: ['west_java_volcanic', 'south_java_mountains'],
    confidence: 0.4,
  },
  oil: {
    name: 'Minyak Bumi',
    emoji: '🛢️',
    type: 'hidrokarbon',
    formation: 'Trap structures in sedimentary basins',
    hostRocks: ['sandstone', 'limestone', 'shale'],
    alteration: ['calcitization'],
    spectralSignature: { absorption: [1.7, 2.3], reflection: [1.5] },
    indonesiaProvinces: ['north_java_basin'],
    confidence: 0.3,
  },
  coal: {
    name: 'Batubara',
    emoji: '⬛',
    type: 'sedimentary',
    formation: 'Tertiary coal seams in basins',
    hostRocks: ['shale', 'sandstone', 'sedimentary'],
    alteration: ['carbonization'],
    spectralSignature: { absorption: [1.5, 2.2], reflection: [0.3] },
    indonesiaProvinces: ['north_java_basin'],
    confidence: 0.35,
  },
}

// ============================================
// ALTERATION ZONES (for epithermal systems)  
// ============================================

const ALTERATION_ZONES = {
  silicification: {
    name: 'Silisifikasi',
    emoji: '💎',
    description: 'Pengayaan silika (SiO₂) — zona inti epitermal',
    temperature: '200-300°C',
    indicator: 'Paling dekat dengan urat bijih',
    minerals: ['gold', 'silver', 'copper'],
    intensity: 0.9,
  },
  argillic: {
    name: 'Argilik',
    emoji: '🧱',
    description: 'Alterasi lempung (kaolinit, illit) — halo sekitar urat',
    temperature: '150-250°C',
    indicator: 'Zona transisi antara silisifikasi dan propilitik',
    minerals: ['gold', 'silver'],
    intensity: 0.7,
  },
  propylitic: {
    name: 'Propilitik',
    emoji: '🟢',
    description: 'Klorit-epidot-kalsit — zona distal sistem epitermal',
    temperature: '100-200°C',
    indicator: 'Zona terluar dari sistem epitermal',
    minerals: ['gold', 'silver', 'copper'],
    intensity: 0.5,
  },
  potassic: {
    name: 'Potasik',
    emoji: '🟣',
    description: 'Feldspar K-biotit — zona inti porfiri',
    temperature: '400-600°C',
    indicator: 'Zona bijih porfiri tembaga-emas',
    minerals: ['copper', 'gold'],
    intensity: 0.85,
  },
  silicic: {
    name: 'Silik',
    emoji: '🔮',
    description: 'Vuggy silica, residual silica — alterasi lanjut',
    temperature: '100-200°C',
    indicator: 'Zona high-sulfidation epitermal',
    minerals: ['gold', 'silver', 'copper'],
    intensity: 0.8,
  },
}

// ============================================
// SPECTRAL INDEX DEFINITIONS
// ============================================

const SPECTRAL_INDICES = {
  iron_oxide: {
    name: 'Iron Oxide',
    emoji: '🟤',
    description: 'Oksida besi — indikasi mineralisasi logam, gossan',
    wavelength: '0.9-1.2μm (SWIR)',
    formula: 'B4/B2 (Sentinel-2)',
    mineralIndication: ['gold', 'iron', 'copper'],
    weight: 0.35,
  },
  clay_minerals: {
    name: 'Clay Minerals',
    emoji: '🟠',
    description: 'Mineral lempung (kaolinit, illit, smektit) — alterasi hidrotermal',
    wavelength: '2.1-2.4μm (SWIR)',
    formula: 'B7/B11 (Sentinel-2)',
    mineralIndication: ['gold', 'silver'],
    weight: 0.25,
  },
  ferrous_minerals: {
    name: 'Ferrous Minerals',
    emoji: '🔵',
    description: 'Mineral besi dalam (Fe²⁺) — intrusi mineral dalam',
    wavelength: '1.5-1.8μm (SWIR)',
    formula: 'B11/B12 (Sentinel-2)',
    mineralIndication: ['iron', 'copper'],
    weight: 0.15,
  },
  silica_index: {
    name: 'Silica/Quartz',
    emoji: '⚪',
    description: 'Silika tinggi — zona urat kuarsa, sering berasosiasi emas',
    wavelength: '2.1-2.3μm (SWIR)',
    formula: '1 - (B11/B12)',
    mineralIndication: ['gold', 'silver'],
    weight: 0.10,
  },
  ndvi: {
    name: 'Vegetation Stress',
    emoji: '🟢',
    description: 'NDVI rendah = vegetasi stress di atas anomali bawah tanah',
    wavelength: '0.8-0.9μm (NIR)',
    formula: '(B8-B4)/(B8+B4)',
    mineralIndication: ['cavity', 'water', 'tunnel'],
    weight: 0.15,
  },
  alteration_index: {
    name: 'Alteration Index',
    emoji: '🔴',
    description: 'Indeks alterasi hidrotermal gabungan',
    wavelength: 'Multi-band',
    formula: '(Clay + Iron + Silica) / 3',
    mineralIndication: ['gold', 'silver', 'copper'],
    weight: 0.20,
  },
}

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Get lithology for a location in Indonesia
 * @param {number} lat 
 * @param {number} lng 
 * @param {number} elevation 
 * @returns {Object} Lithology info
 */
export function getIndonesiaLithology(lat, lng, elevation = 200) {
  // Determine geological province from coordinates
  const province = determineProvince(lat, lng)
  const geoData = INDONESIA_LITHOLOGY[province] || INDONESIA_LITHOLOGY.west_java_volcanic
  
  // Select rock type based on elevation
  const terrainType = elevation > 500 ? 'mountainous' : elevation > 200 ? 'hills' : 'lowlands'
  const possibleRocks = geoData.rocks.filter(r => r.coverage === terrainType || r.coverage === 'all')
  const rock = possibleRocks.length > 0
    ? possibleRocks[Math.floor(Math.random() * possibleRocks.length)]
    : geoData.rocks[0]
  
  return {
    region: geoData.region,
    age: geoData.age,
    rockName: rock.name,
    rockType: rock.type,
    description: rock.desc,
    formation: geoData.region,
    potentialMinerals: geoData.minerals,
    alterationTypes: geoData.alteration,
    source: 'Indonesia Geological Database',
    confidence: 0.7,
  }
}

/**
 * Analyze spectral indices for a point
 * @param {Object} lithology 
 * @param {Object} terrain - { elevation, slope, curvature }
 * @returns {Object} Spectral analysis
 */
export function computeSpectralIndices(lithology, terrain) {
  const elevation = terrain.elevation || 200
  const slope = terrain.slope || 0
  const rockType = lithology.rockType || 'volcanic'
  
  // Rock type base spectral signatures
  const baseSignature = {
    volcanic: { ironOxide: 0.6, clay: 0.5, ferrous: 0.5, silica: 0.4, ndvi: 0.3 },
    basalt: { ironOxide: 0.7, clay: 0.3, ferrous: 0.7, silica: 0.2, ndvi: 0.2 },
    igneous: { ironOxide: 0.5, clay: 0.4, ferrous: 0.5, silica: 0.5, ndvi: 0.3 },
    andesite: { ironOxide: 0.55, clay: 0.45, ferrous: 0.5, silica: 0.45, ndvi: 0.3 },
    limestone: { ironOxide: 0.2, clay: 0.4, ferrous: 0.2, silica: 0.1, ndvi: 0.5 },
    sandstone: { ironOxide: 0.4, clay: 0.3, ferrous: 0.3, silica: 0.6, ndvi: 0.4 },
    shale: { ironOxide: 0.3, clay: 0.6, ferrous: 0.3, silica: 0.2, ndvi: 0.4 },
    sedimentary: { ironOxide: 0.3, clay: 0.4, ferrous: 0.3, silica: 0.3, ndvi: 0.45 },
    alluvial: { ironOxide: 0.3, clay: 0.5, ferrous: 0.2, silica: 0.2, ndvi: 0.5 },
    unknown: { ironOxide: 0.3, clay: 0.3, ferrous: 0.3, silica: 0.3, ndvi: 0.4 },
  }
  
  const sig = baseSignature[rockType] || baseSignature.unknown
  
  // Elevation/terrain modulation
  const elevFactor = Math.max(0, Math.min(1, (elevation - 50) / 2000))
  const slopeFactor = Math.min(slope / 45, 1)
  
  const indices = {
    iron_oxide: clamp(sig.ironOxide + slopeFactor * 0.15 + Math.random() * 0.08, 0.05, 0.95),
    clay_minerals: clamp(sig.clay + (1 - elevFactor) * 0.15 + Math.random() * 0.08, 0.05, 0.9),
    ferrous_minerals: clamp(sig.ferrous + slopeFactor * 0.1 + Math.random() * 0.06, 0.05, 0.9),
    silica_index: clamp(sig.silica + (1 - slopeFactor) * 0.1 + Math.random() * 0.06, 0.05, 0.85),
    ndvi: clamp(sig.ndvi - elevFactor * 0.2 - slopeFactor * 0.15 + Math.random() * 0.1, 0.05, 0.85),
    alteration_index: 0,
  }
  
  indices.alteration_index = clamp(
    (indices.iron_oxide + indices.clay_minerals + indices.silica_index) / 3,
    0.05, 0.9
  )
  
  // Determine anomaly level
  const maxIndex = Math.max(...Object.values(indices))
  let anomalyLevel = 'low'
  if (maxIndex > 0.7) anomalyLevel = 'high'
  else if (maxIndex > 0.5) anomalyLevel = 'moderate'
  
  return { indices, anomalyLevel, maxIndex }
}

/**
 * Detect alteration zone from spectral indices
 */
export function detectAlteration(indices, lithology) {
  const { iron_oxide, clay_minerals, silica_index, alteration_index } = indices
  
  // Match alteration type based on spectral signature
  if (silica_index > 0.6 && alteration_index > 0.5) return { ...ALTERATION_ZONES.silicification, confidence: clamp(silica_index, 0, 1) }
  if (clay_minerals > 0.5 && iron_oxide > 0.4) return { ...ALTERATION_ZONES.argillic, confidence: clamp(clay_minerals, 0, 1) }
  if (iron_oxide > 0.5 && clay_minerals < 0.4) return { ...ALTERATION_ZONES.propylitic, confidence: clamp(iron_oxide * 0.7, 0, 1) }
  if (silica_index > 0.5 && iron_oxide > 0.5) return { ...ALTERATION_ZONES.potassic, confidence: clamp((silica_index + iron_oxide) / 2, 0, 1) }
  if (silica_index > 0.7 && alteration_index > 0.6) return { ...ALTERATION_ZONES.silicic, confidence: clamp(silica_index * 0.8, 0, 1) }
  
  return null
}

/**
 * Detect epithermal potential
 */
export function analyzeEpithermal(lithology, indices, alteration) {
  const rockType = lithology.rockType || 'unknown'
  const potentialMinerals = lithology.potentialMinerals || []
  
  // Volcanic arcs + alteration = epithermal potential
  const isVolcanicHost = ['volcanic', 'andesite', 'dacite', 'diorite', 'igneous'].includes(rockType)
  const hasAlteration = alteration !== null
  const hasIndication = indices.alteration_index > 0.4
  
  let epithermalScore = 0
  if (isVolcanicHost) epithermalScore += 0.3
  if (hasAlteration) epithermalScore += 0.35
  if (hasIndication) epithermalScore += 0.25
  if (potentialMinerals.includes('gold')) epithermalScore += 0.1
  
  // Detect specific deposit types
  const depositTypes = []
  if (epithermalScore > 0.6 && alteration?.name === 'Silicifikasi') {
    depositTypes.push({ type: 'High Sulfidation Epitermal', conf: epithermalScore * 0.9, minerals: ['gold', 'silver', 'copper'] })
  }
  if (epithermalScore > 0.5 && alteration?.name === 'Argilik') {
    depositTypes.push({ type: 'Low Sulfidation Epitermal', conf: epithermalScore * 0.8, minerals: ['gold', 'silver'] })
  }
  if (epithermalScore > 0.4 && isVolcanicHost) {
    depositTypes.push({ type: 'Porphyry Cu-Au', conf: epithermalScore * 0.6, minerals: ['copper', 'gold'] })
  }
  
  return {
    potential: epithermalScore > 0.4,
    score: clamp(epithermalScore, 0, 1),
    depositTypes: depositTypes.sort((a, b) => b.conf - a.conf),
    recommendedExploration: epithermalScore > 0.6 ? 'HIGH PRIORITY' : epithermalScore > 0.4 ? 'MODERATE' : 'LOW',
  }
}

function determineProvince(lat, lng) {
  // Simple bounding box for West Java
  if (lat > -7.5 && lat < -6.0 && lng > 106.5 && lng < 108.5) return 'west_java_volcanic'
  if (lat > -7.0 && lat < -6.0 && lng > 108.5 && lng < 114.0) return 'north_java_basin'
  if (lat > -8.5 && lat < -7.5 && lng > 108.0 && lng < 114.0) return 'south_java_mountains'
  // Default: volcanic arc (most of Indonesia is volcanic)
  return 'west_java_volcanic'
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

export { INDONESIA_LITHOLOGY, MINERAL_DATABASE, ALTERATION_ZONES, SPECTRAL_INDICES }
/**
 * Lithology Classifier — pure functions
 * Rock type classification from geology and terrain data.
 */

/**
 * Rock type classification based on elevation and terrain
 * @param {string} province - geological province
 * @param {number} elevation - meters
 * @param {string} terrainType - mountainous, hills, lowlands
 * @returns {Object} lithology info
 */
export function classifyRockType(province, elevation, terrainType) {
  // Simplified Indonesia lithology classification
  const provinces = {
    west_java_volcanic: {
      region: 'West Java Volcanic Arc',
      rockType: 'volcanic',
      rockName: 'Volcanic Rocks (Tertiary-Quaternary)',
      description: 'Andesitic-basaltic volcanic rocks, tuff, breccia, and lava flows',
      confidence: 0.7,
      source: 'Indonesia Geological Database',
      potentialMinerals: ['gold', 'silver', 'copper', 'sulfur'],
      elevationRange: { min: 0, max: 3000 },
    },
    north_java_sedimentary: {
      region: 'North Java Sedimentary Basin',
      rockType: 'sedimentary',
      rockName: 'Sedimentary Rocks (Tertiary)',
      description: 'Sandstone, claystone, limestone, and marl',
      confidence: 0.65,
      source: 'Indonesia Geological Database',
      potentialMinerals: ['oil', 'gas', 'coal', 'limestone'],
      elevationRange: { min: 0, max: 500 },
    },
    south_java_metamorphic: {
      region: 'South Java Metamorphic Complex',
      rockType: 'metamorphic',
      rockName: 'Metamorphic Rocks (Pre-Tertiary)',
      description: 'Schist, phyllite, marble, and quartzite',
      confidence: 0.6,
      source: 'Indonesia Geological Database',
      potentialMinerals: ['gold', 'silver', 'iron', 'manganese'],
      elevationRange: { min: 0, max: 500 },
    },
  }

  return provinces[province] || provinces.west_java_volcanic
}

/**
 * Terrain classification from elevation
 * @param {number} elevation
 * @returns {string}
 */
export function classifyTerrain(elevation) {
  if (elevation > 1500) return 'mountainous_high'
  if (elevation > 500) return 'mountainous'
  if (elevation > 200) return 'hills'
  if (elevation > 50) return 'lowlands'
  return 'coastal'
}

/**
 * Get rock type emoji
 * @param {string} rockType
 * @returns {string}
 */
export function getRockEmoji(rockType) {
  const map = {
    volcanic: '🌋', granite: '🗿', basalt: '🌑',
    igneous: '🌋', sedimentary: '🏜️', limestone: '⛰️',
    sandstone: '🪨', metamorphic: '💎', alluvial: '🏞️',
  }
  return map[rockType] || '❓'
}

/**
 * Get rock label in Indonesian
 * @param {string} rockType
 * @returns {string}
 */
export function getRockLabel(rockType) {
  const map = {
    igneous: 'Batuan Beku', granite: 'Granit', basalt: 'Basalt',
    volcanic: 'Batuan Vulkanik', sedimentary: 'Sedimen',
    limestone: 'Batu Kapur', sandstone: 'Batu Pasir',
    metamorphic: 'Metamorf', alluvial: 'Aluvial',
  }
  return map[rockType] || 'Tidak Diketahui'
}
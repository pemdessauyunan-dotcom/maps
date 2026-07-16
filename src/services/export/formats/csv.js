/**
 * CSV Format Exporter
 */

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data
 * @returns {string} CSV content
 */
export function exportCSV(data) {
  if (!data || data.length === 0) return ''

  // Flatten nested objects
  const flat = data.map(item => flattenObject(item))

  // Collect all unique keys
  const keys = [...new Set(flat.flatMap(Object.keys))]

  // Header row
  const header = keys.map(escapeCSV).join(',')

  // Data rows
  const rows = flat.map(row =>
    keys.map(key => escapeCSV(row[key] ?? '')).join(',')
  )

  return [header, ...rows].join('\n')
}

function flattenObject(obj, prefix = '', result = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      flattenObject(value, fullKey, result)
    } else {
      result[fullKey] = value
    }
  }
  return result
}

function escapeCSV(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Convert analysis result to CSV rows
 * @param {Object} analysis - Full analysis object
 * @returns {string} CSV
 */
export function analysisToCSV(analysis) {
  if (!analysis) return ''
  const { thermal, spectral, alteration, prospectivity, depth, geology } = analysis

  const row = {
    // Coordinate
    lat: thermal?.lat,
    lng: thermal?.lng,
    elevation: thermal?.elevation,

    // Thermal
    surface_temp: thermal?.temperature?.surface,
    expected_temp: thermal?.temperature?.expected,
    thermal_anomaly: thermal?.temperature?.anomaly,
    anomaly_level: thermal?.anomalyLevel,
    risk_score: thermal?.riskScore,

    // Rock
    rock_type: thermal?.lithology?.rockType,
    rock_label: thermal?.lithology?.rockLabel,
    thermal_inertia: thermal?.lithology?.thermalInertia,

    // Spectral
    iron_oxide: spectral?.indices?.iron_oxide,
    clay_minerals: spectral?.indices?.clay_minerals,
    silica_index: spectral?.indices?.silica_index,
    ndvi: spectral?.indices?.ndvi,

    // Alteration
    alteration_zone: alteration?.name,
    alteration_intensity: alteration?.intensity,

    // Prospectivity
    prospectivity_score: prospectivity?.score,
    prospectivity_confidence: prospectivity?.confidence,

    // Depth
    depth_m: depth?.depth,
    depth_classification: depth?.classification?.label,

    // Geology
    formation: geology?.formation,
    lithology: geology?.lithology,
  }

  return exportCSV([row])
}
/**
 * Confidence Engine — pure functions
 * Calculates confidence scores for analysis results.
 */

/**
 * Calculate confidence from multiple factors
 * @param {Array<{value: number, weight: number}>} factors
 * @returns {number} 0-1
 */
export function calcConfidence(factors) {
  if (!factors || factors.length === 0) return 0
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  if (totalWeight === 0) return 0
  const weighted = factors.reduce((s, f) => s + f.value * f.weight, 0)
  return Math.min(1, Math.max(0, weighted / totalWeight))
}

/**
 * Assess data quality
 * @param {Object} sources - Available data sources
 * @returns {{ score: number, label: string }}
 */
export function assessDataQuality(sources) {
  const scores = {
    satellite: 0.9,
    aerial: 0.8,
    field: 0.95,
    model: 0.6,
    estimated: 0.3,
  }
  let total = 0
  let count = 0
  for (const [source, weight] of Object.entries(sources)) {
    if (weight) {
      total += (scores[source] || 0.5) * weight
      count += weight
    }
  }
  const score = count > 0 ? total / count : 0.3
  const label = score > 0.8 ? 'High' : score > 0.5 ? 'Moderate' : 'Low'
  return { score: parseFloat(score.toFixed(2)), label }
}

/**
 * Calculate anomaly reliability
 * @param {number} anomalyMagnitude
 * @param {number} dataQuality
 * @param {number} sampleCount
 * @returns {number}
 */
export function anomalyReliability(anomalyMagnitude, dataQuality, sampleCount) {
  const magFactor = Math.min(Math.abs(anomalyMagnitude) / 5, 1)
  const qualityFactor = dataQuality
  const sampleFactor = Math.min(sampleCount / 10, 1)
  return parseFloat((magFactor * 0.4 + qualityFactor * 0.4 + sampleFactor * 0.2).toFixed(2))
}
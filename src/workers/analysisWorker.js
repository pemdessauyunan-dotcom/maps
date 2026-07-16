/**
 * Analysis Worker — Background processing for heavy computations
 * Uses Comlink for RPC-style communication with the main thread.
 * 
 * This worker handles:
 * - Thermal grid generation (heavy computation)
 * - Batch analysis of multiple points
 * - Export file generation
 * 
 * Usage (main thread):
 *   import { wrap } from 'comlink'
 *   const worker = wrap(new Worker(new URL('./analysisWorker.js', import.meta.url)))
 *   const result = await worker.analyzePoint(lat, lng)
 */

// Import pure functions only — no React, no DOM
import { analyzeThermalLithology } from '../analysis/thermal/thermalEquations'
import { detectAlteration } from '../analysis/alteration/alterationEquations'
import { classifyRockType } from '../analysis/lithology/lithologyClassifier'
import { calcConfidence } from '../analysis/confidence/confidenceEngine'

/**
 * Analyze a single point (heavy computation)
 * @param {number} lat
 * @param {number} lng
 * @param {Object} data - Pre-fetched elevation and geology data
 * @returns {Object} Analysis results
 */
export async function analyzePointInWorker(lat, lng, data) {
  // Thermal computation
  const surfaceTemp = analyzeThermalLithology(lat, lng, data)
  // Alteration detection
  const alteration = detectAlteration(data.indices, data.lithology)
  // Classification
  const rockType = classifyRockType(data.province, data.elevation, data.terrain)
  // Confidence
  const confidence = calcConfidence([
    { value: data.elevation ? 0.8 : 0.3, weight: 0.3 },
    { value: data.geology ? 0.7 : 0.3, weight: 0.3 },
    { value: surfaceTemp ? 0.6 : 0.2, weight: 0.2 },
    { value: data.indices ? 0.7 : 0.2, weight: 0.2 },
  ])

  return {
    surfaceTemp,
    alteration,
    rockType,
    confidence,
    lat,
    lng,
    computedAt: Date.now(),
  }
}

/**
 * Generate thermal grid (CPU-intensive)
 * @param {Array} gridPoints - Array of {lat, lng, elevation}
 * @param {Object} geology - Base geology info
 * @returns {Array} Grid with thermal values
 */
export async function generateThermalGrid(gridPoints, geology) {
  const results = []
  for (const point of gridPoints) {
    const result = analyzeThermalLithology(point.lat, point.lng, point)
    results.push({ ...point, ...result })
  }
  return results
}

// Worker self-registration
self.onmessage = async (event) => {
  const { type, data, id } = event.data
  try {
    let result
    switch (type) {
      case 'analyzePoint':
        result = await analyzePointInWorker(data.lat, data.lng, data)
        break
      case 'generateGrid':
        result = await generateThermalGrid(data.points, data.geology)
        break
      default:
        result = { error: 'Unknown worker command: ' + type }
    }
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err.message })
  }
}
/**
 * AI Pipeline — Multi-source fusion for mineral prospectivity
 * 
 * Pipeline:
 *   Satellite → Thermal → Spectral → Scientific Engine → Worker → Confidence → Visualization
 * 
 * All processing happens in the analysis pipeline.
 * This module provides the AI/ML layer on top of the scientific engine.
 */

import { analyzePoint } from '../analysisOrchestrator'

/**
 * Run full AI analysis pipeline for a single point
 * @param {number} lat
 * @param {number} lng
 * @param {Object} options
 * @returns {Promise<Object>} Enhanced analysis with AI predictions
 */
export async function runAIPipeline(lat, lng, options = {}) {
  // 1. Base analysis
  const analysis = await analyzePoint(lat, lng)

  // 2. AI enhancements
  const enhanced = {
    ...analysis,
    ai: {
      // Feature importance ranking
      featureImportance: computeFeatureImportance(analysis),
      // Anomaly clustering
      clusterId: clusterAnomaly(analysis),
      // Confidence calibration
      calibratedConfidence: calibrateConfidence(analysis),
      // Recommendation engine
      recommendations: generateRecommendations(analysis),
    },
  }

  return enhanced
}

/**
 * Compute feature importance for the current analysis
 * Which features contributed most to the prospectivity score?
 */
function computeFeatureImportance(analysis) {
  const { thermal, spectral, alteration, lineament, vegetation, prospectivity } = analysis
  const features = {}

  if (thermal) {
    features.thermal = Math.abs(thermal.temperature?.anomaly || 0) / 5
  }
  if (spectral?.indices) {
    features.spectral = Object.values(spectral.indices).reduce((a, b) => a + b, 0) / Object.keys(spectral.indices).length
  }
  if (alteration) {
    features.alteration = alteration.intensity || 0.5
  }
  if (lineament) {
    features.lineament = lineament.density || 0
  }
  if (vegetation) {
    features.vegetation = vegetation.anomaly?.level === 'critical' ? 0.8 : vegetation.anomaly?.level === 'high' ? 0.5 : 0.2
  }

  // Normalize to percentages
  const total = Object.values(features).reduce((a, b) => a + b, 0) || 1
  const normalized = {}
  for (const [key, value] of Object.entries(features)) {
    normalized[key] = parseFloat(((value / total) * 100).toFixed(1))
  }

  return normalized
}

/**
 * Cluster anomalies by type
 */
function clusterAnomaly(analysis) {
  const { thermal } = analysis
  if (!thermal?.anomalies?.length) return 'none'

  const hasHighTemp = thermal.anomalies.some(a => a.tempAnomaly > 3)
  const hasLowTemp = thermal.anomalies.some(a => a.tempAnomaly < -2)
  const hasTreasure = thermal.anomalies.some(a => a.category === 'treasure' && a.matched)

  if (hasTreasure) return 'treasure'
  if (hasHighTemp && hasLowTemp) return 'complex'
  if (hasHighTemp) return 'thermal_high'
  if (hasLowTemp) return 'thermal_low'
  return 'background'
}

/**
 * Calibrate confidence scores based on data quality
 */
function calibrateConfidence(analysis) {
  const { prospectivity, thermal } = analysis
  let base = prospectivity?.confidence || 0.5

  // Adjust based on data sources
  if (analysis.spectral?.environmental) base += 0.1 // NASA POWER data available
  if (thermal?.anomalies?.some(a => a.matched)) base += 0.15

  return parseFloat(Math.min(1, base).toFixed(2))
}

/**
 * Generate actionable recommendations
 */
function generateRecommendations(analysis) {
  const { thermal, prospectivity, depth } = analysis
  const recs = []

  // Check for strong anomalies
  if (thermal?.anomalies?.some(a => a.matched && a.category === 'treasure')) {
    recs.push({
      priority: 'HIGH',
      action: '🚨 Investigasi harta karun! Anomali kuat terdeteksi.',
      detail: 'Lakukan survey detail dengan GPS untuk pinpoint lokasi.',
    })
  }

  if (prospectivity?.score > 0.6) {
    recs.push({
      priority: 'HIGH',
      action: '⛏️ Prospek mineral tinggi!',
      detail: `Skor prospektivitas ${(prospectivity.score * 100).toFixed(0)}%. ${prospectivity.recommendedAction}`,
    })
  } else if (prospectivity?.score > 0.3) {
    recs.push({
      priority: 'MEDIUM',
      action: '🔍 Potensi moderat',
      detail: 'Perlu survey lanjutan dengan grid lebih rapat.',
    })
  }

  if (depth?.depth) {
    recs.push({
      priority: 'INFO',
      action: `📏 Target di kedalaman ${depth.depth}m`,
      detail: depth.recommendedAction,
    })
  }

  return recs
}
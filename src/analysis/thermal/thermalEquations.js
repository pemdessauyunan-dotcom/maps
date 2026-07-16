/**
 * Thermal Equations — pure functions
 * No React, no DOM, no side effects.
 */

/**
 * Calculate surface temperature from elevation
 * @param {number} elevation - meters
 * @param {number} baseTemp - base temperature at sea level
 * @param {number} lapseRate - °C per meter (default: -0.0065)
 * @returns {number} Surface temperature
 */
export function calcSurfaceTemp(elevation, baseTemp = 35, lapseRate = -0.0065) {
  return baseTemp + elevation * lapseRate
}

/**
 * Calculate thermal anomaly
 * @param {number} measured - measured temperature
 * @param {number} expected - expected temperature
 * @returns {number} Anomaly value
 */
export function calcAnomaly(measured, expected) {
  return measured - expected
}

/**
 * Classify anomaly level
 * @param {number} anomaly - temperature anomaly
 * @returns {{ level: string, color: string }}
 */
export function classifyAnomaly(anomaly) {
  const abs = Math.abs(anomaly)
  if (abs > 4) return { level: 'critical', color: '#ef4444' }
  if (abs > 3) return { level: 'high', color: '#f59e0b' }
  if (abs > 1.5) return { level: 'moderate', color: '#eab308' }
  return { level: 'normal', color: '#22c55e' }
}

/**
 * Rock thermal conductivity factors
 * Lower = better insulator (heats up more)
 */
export const ROCK_CONDUCTIVITY = {
  igneous: 0.8, granite: 0.7, basalt: 0.9,
  volcanic: 0.85, sedimentary: 1.2, sandstone: 1.1,
  limestone: 1.3, metamorphic: 0.9, alluvial: 1.5,
}

/**
 * Calculate thermal inertia
 * @param {string} rockType
 * @returns {number} Inertia value (0-1)
 */
export function calcThermalInertia(rockType) {
  const factor = ROCK_CONDUCTIVITY[rockType] || 1.0
  return parseFloat((1 - factor * 0.4).toFixed(2))
}

/**
 * Calculate risk score from anomalies
 * @param {Array} anomalies
 * @returns {number} Risk score 0-1
 */
export function calcRiskScore(anomalies) {
  if (!anomalies || anomalies.length === 0) return 0
  const maxConf = Math.max(...anomalies.map(a => a.confidence || 0))
  const maxTemp = Math.max(...anomalies.map(a => Math.abs(a.tempAnomaly || 0)))
  const confScore = maxConf
  const tempScore = Math.min(maxTemp / 10, 1)
  return parseFloat((confScore * 0.6 + tempScore * 0.4).toFixed(3))
}
/**
 * Analysis Orchestrator
 * Coordinates all scientific engines for a single-point analysis.
 * Pure orchestration — no React, no DOM, no side effects.
 */
import { analyzeThermalLithology } from './thermalLithology'
import { computeSpectralIndices, detectAlteration, analyzeEpithermal, getIndonesiaLithology } from './indonesiaGeology'
import { fetchGeologicalInfo } from './geologicalApi'
import { analyzeLineaments } from './lineamentAnalysis'
import { analyzeVegetation } from './vegetationAnalysis'
import { calculateProspectivity } from './prospectivityModel'
import { predictDepth } from './depthPrediction'
import { fetchTerrainGrid } from './terrainService'
import { fetchEnvironmentalData, computeSpectralFromEnvironment } from './environmentalApi'

/**
 * Full analysis pipeline for a single geographic point
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>} All analysis results
 */
export async function analyzePoint(lat, lng) {
  // 1. Elevation
  const elevRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`)
  const elevData = elevRes.ok ? await elevRes.json() : { elevation: [200] }
  const elevation = elevData.elevation?.[0] || 200

  // 2. Geology
  const geoInfo = await fetchGeologicalInfo(lat, lng, elevation)

  // 3. Thermal
  const thermal = analyzeThermalLithology(lat, lng, { elevation }, geoInfo)

  // 4. Spectral
  const lithology = getIndonesiaLithology(lat, lng, elevation)
  const spectral = computeSpectralIndices(lithology, { elevation, slope: 0, lat, lng })

  // 4b. Enhanced spectral from real environmental data (NASA POWER)
  const envData = await fetchEnvironmentalData(lat, lng)
  const envSpectral = computeSpectralFromEnvironment(envData, lithology)
  // Merge: use real environmental data where available, fallback to computed
  if (envSpectral) {
    spectral.indices.iron_oxide = (spectral.indices.iron_oxide + envSpectral.iron_oxide) / 2
    spectral.indices.clay_minerals = (spectral.indices.clay_minerals + envSpectral.clay_minerals) / 2
    spectral.indices.silica_index = (spectral.indices.silica_index + envSpectral.silica_index) / 2
    spectral.indices.ndvi = (spectral.indices.ndvi + envSpectral.ndvi) / 2
    spectral.environmental = envSpectral
  }

  const alteration = detectAlteration(spectral.indices, lithology)
  const epithermal = analyzeEpithermal(lithology, spectral.indices, alteration)

  // 5. Lineament
  let terrainGrid = []
  try { terrainGrid = await fetchTerrainGrid(lat, lng) } catch {}
  const lineament = analyzeLineaments(terrainGrid, { lat, lng })

  // 6. Vegetation
  const vegetation = analyzeVegetation(lat, lng, { elevation, slope: 0 }, geoInfo, thermal.anomalies)

  // 7. Prospectivity
  const prospectivity = calculateProspectivity(thermal, spectral, alteration, lineament, vegetation, geoInfo)

  // 8. Depth
  const depth = predictDepth(thermal, alteration, lineament, prospectivity, geoInfo)

  return {
    thermal,
    spectral,
    alteration,
    epithermal,
    lineament,
    vegetation,
    prospectivity,
    depth,
    geology: geoInfo,
    coordinate: { lat, lng, elevation },
  }
}
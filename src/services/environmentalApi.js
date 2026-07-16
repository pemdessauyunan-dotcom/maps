/**
 * NASA POWER API Service
 * Free agroclimatology data — no API key required.
 * Provides: solar radiation, temperature, precipitation, humidity.
 * 
 * https://power.larc.nasa.gov/docs/services/api/
 */

const POWER_API = 'https://power.larc.nasa.gov/api/temporal/monthly/point'

/**
 * Fetch environmental data for a location
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object>} Environmental data
 */
export async function fetchEnvironmentalData(lat, lng) {
  try {
    const url = `${POWER_API}?parameters=ALLSKY_SFC_SW_DWN,PRECTOTCORR,T2M,T2M_MAX,T2M_MIN,RH2M,WS2M&community=RE&longitude=${lng}&latitude=${lat}&start=2025&end=2025&format=JSON`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`NASA POWER API error: ${res.status}`)
    const data = await res.json()
    const props = data?.properties?.parameter || {}

    // Extract monthly averages
    const solarRadiation = averageValues(props.ALLSKY_SFC_SW_DWN)
    const precipitation = averageValues(props.PRECTOTCORR)
    const temperature = averageValues(props.T2M)
    const tempMax = averageValues(props.T2M_MAX)
    const tempMin = averageValues(props.T2M_MIN)
    const humidity = averageValues(props.RH2M)
    const windSpeed = averageValues(props.WS2M)

    return {
      solarRadiation: parseFloat(solarRadiation.toFixed(2)), // kWh/m²/day
      precipitation: parseFloat(precipitation.toFixed(1)), // mm/month
      temperature: parseFloat(temperature.toFixed(1)), // °C
      tempMax: parseFloat(tempMax.toFixed(1)),
      tempMin: parseFloat(tempMin.toFixed(1)),
      humidity: parseFloat(humidity.toFixed(0)), // %
      windSpeed: parseFloat(windSpeed.toFixed(1)), // m/s
      source: 'NASA POWER',
    }
  } catch (err) {
    console.warn('NASA POWER fetch failed:', err.message)
    return null
  }
}

/**
 * Compute spectral indices from environmental data
 * @param {Object} env - Environmental data from NASA POWER
 * @param {Object} lithology - Rock type info
 * @returns {Object} Enhanced spectral indices
 */
export function computeSpectralFromEnvironment(env, lithology) {
  if (!env) return null

  const rockType = lithology?.rockType || 'unknown'

  // Solar radiation affects iron oxide oxidation
  const ironOxideBase = rockType === 'volcanic' ? 0.5 : rockType === 'sedimentary' ? 0.3 : 0.4
  const ironOxide = Math.min(0.9, ironOxideBase + (env.solarRadiation / 10) * 0.1)

  // Precipitation affects clay formation
  const clayBase = rockType === 'volcanic' ? 0.4 : rockType === 'sedimentary' ? 0.5 : 0.3
  const clayMinerals = Math.min(0.85, clayBase + (env.precipitation / 100) * 0.15)

  // Temperature affects silica precipitation
  const silicaIndex = Math.min(0.8, 0.3 + (env.temperature / 40) * 0.2)

  // NDVI from precipitation and temperature
  const ndvi = Math.min(0.85, Math.max(0.05, 0.3 + (env.precipitation / 200) * 0.3 - (env.temperature / 50) * 0.15))

  return {
    iron_oxide: parseFloat(ironOxide.toFixed(3)),
    clay_minerals: parseFloat(clayMinerals.toFixed(3)),
    silica_index: parseFloat(silicaIndex.toFixed(3)),
    ndvi: parseFloat(ndvi.toFixed(3)),
    solarRadiation: env.solarRadiation,
    precipitation: env.precipitation,
    temperature: env.temperature,
  }
}

function averageValues(param) {
  if (!param) return 0
  const values = Object.values(param).filter(v => v != null && !isNaN(v))
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}
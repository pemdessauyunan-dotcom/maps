// Open-Meteo Elevation API Service
// Free, no API key required
// Docs: https://open-meteo.com/en/docs/elevation-api

const ELEVATION_API = 'https://api.open-meteo.com/v1/elevation'
const CACHE_KEY = 'elevation_cache'
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000 // 7 days

// In-memory cache for session
const memoryCache = new Map()

/**
 * Get cached elevation or null
 */
function getCachedElevation(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`

  // Check memory cache first
  if (memoryCache.has(key)) return memoryCache.get(key)

  // Check localStorage
  try {
    const stored = localStorage.getItem(CACHE_KEY)
    if (stored) {
      const cache = JSON.parse(stored)
      if (cache[key] && (Date.now() - cache[key].t) < CACHE_EXPIRY) {
        memoryCache.set(key, cache[key].v)
        return cache[key].v
      }
    }
  } catch (e) { /* ignore */ }

  return null
}

/**
 * Save elevation to cache
 */
function cacheElevation(lat, lng, elevation) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`
  memoryCache.set(key, elevation)

  try {
    const stored = localStorage.getItem(CACHE_KEY)
    const cache = stored ? JSON.parse(stored) : {}
    cache[key] = { v: elevation, t: Date.now() }
    // Keep cache manageable - remove oldest entries if too large
    const keys = Object.keys(cache)
    if (keys.length > 5000) {
      const sorted = keys.sort((a, b) => cache[a].t - cache[b].t)
      sorted.slice(0, 1000).forEach(k => delete cache[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch (e) {
    // localStorage full, clear old cache
    localStorage.removeItem(CACHE_KEY)
  }
}

/**
 * Fetch elevation for a single point
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<number>} Elevation in meters
 */
export async function fetchElevation(lat, lng) {
  const cached = getCachedElevation(lat, lng)
  if (cached !== null) return cached

  try {
    const res = await fetch(`${ELEVATION_API}?latitude=${lat}&longitude=${lng}`)
    if (!res.ok) throw new Error(`Elevation API error: ${res.status}`)
    const data = await res.json()
    const elevation = data.elevation?.[0] ?? 0
    cacheElevation(lat, lng, elevation)
    return elevation
  } catch (err) {
    console.warn('Failed to fetch elevation:', err.message)
    return null
  }
}

/**
 * Fetch elevation for multiple points in batch (up to 100 per request)
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {Promise<Array<number|null>>} Elevations in meters
 */
export async function fetchElevationBatch(points) {
  if (points.length === 0) return []

  // Check cache for each point
  const results = new Array(points.length)
  const uncached = []
  const uncachedIndices = []

  points.forEach((p, i) => {
    const cached = getCachedElevation(p.lat, p.lng)
    if (cached !== null) {
      results[i] = cached
    } else {
      uncached.push(p)
      uncachedIndices.push(i)
    }
  })

  if (uncached.length === 0) return results

  // Batch uncached points (max 100 per request)
  const batchSize = 100
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize)
    const batchIndices = uncachedIndices.slice(i, i + batchSize)

    const lats = batch.map(p => p.lat.toFixed(5)).join(',')
    const lngs = batch.map(p => p.lng.toFixed(5)).join(',')

    try {
      const res = await fetch(`${ELEVATION_API}?latitude=${lats}&longitude=${lngs}`)
      if (!res.ok) throw new Error(`Batch elevation API error: ${res.status}`)
      const data = await res.json()
      const elevations = data.elevation || []

      batchIndices.forEach((origIdx, batchIdx) => {
        const elev = elevations[batchIdx] ?? 0
        results[origIdx] = elev
        cacheElevation(batch[batchIdx].lat, batch[batchIdx].lng, elev)
      })
    } catch (err) {
      console.warn('Batch elevation fetch failed:', err.message)
      batchIndices.forEach(idx => { results[idx] = null })
    }
  }

  return results
}

/**
 * Fetch elevation profile along a line (cross-section)
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} endLat
 * @param {number} endLng
 * @param {number} steps - Number of sample points (default 50)
 * @returns {Promise<Array<{lat: number, lng: number, elevation: number, distance: number}>>}
 */
export async function fetchElevationProfile(startLat, startLng, endLat, endLng, steps = 50) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push({
      lat: startLat + (endLat - startLat) * t,
      lng: startLng + (endLng - startLng) * t,
    })
  }

  const elevations = await fetchElevationBatch(points)

  // Calculate cumulative distance
  let totalDist = 0
  const profile = points.map((p, i) => {
    if (i > 0) {
      const dLat = (p.lat - points[i - 1].lat) * 111000
      const dLng = (p.lng - points[i - 1].lng) * 111000 * Math.cos(p.lat * Math.PI / 180)
      totalDist += Math.sqrt(dLat * dLat + dLng * dLng)
    }
    return {
      lat: p.lat,
      lng: p.lng,
      elevation: elevations[i] ?? 0,
      distance: totalDist,
    }
  })

  return profile
}

/**
 * Fetch surrounding elevation grid for terrain analysis
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} radiusKm - Radius in kilometers
 * @param {number} gridSize - Grid resolution (e.g., 5 = 5x5 grid)
 * @returns {Promise<Array<{lat: number, lng: number, elevation: number}>>}
 */
export async function fetchSurroundingTerrain(centerLat, centerLng, radiusKm = 0.5, gridSize = 7) {
  const points = []
  const latStep = (radiusKm * 2) / (gridSize - 1) / 111
  const lngStep = latStep / Math.cos(centerLat * Math.PI / 180)
  const startLat = centerLat - radiusKm / 111
  const startLng = centerLng - (radiusKm / 111) / Math.cos(centerLat * Math.PI / 180)

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      points.push({
        lat: startLat + i * latStep,
        lng: startLng + j * lngStep,
      })
    }
  }

  const elevations = await fetchElevationBatch(points)
  return points.map((p, i) => ({ ...p, elevation: elevations[i] ?? 0 }))
}

/**
 * Clear elevation cache
 */
export function clearElevationCache() {
  memoryCache.clear()
  localStorage.removeItem(CACHE_KEY)
}

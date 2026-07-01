/**
 * Supabase integration for storing and retrieving satellite anomaly data
 */

const SUPABASE_URL = 'https://dltfghbqgspelefphgee.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsdGZnaGJxZ3NwZWxlZnBoZ2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4OTU2NDIsImV4cCI6MjA5ODQ3MTY0Mn0.wBCNJ-1fLmtHMIefwbSwQlCPg38Y50ChcTNwiOogsEI'

/**
 * Upload anomaly data to Supabase
 * @param {Array} anomalies - Array of anomaly objects
 * @param {Object} metadata - Processing metadata
 * @returns {Promise<Object>} Upload result
 */
export async function uploadAnomalyData(anomalies, metadata) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/satellite_anomalies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        anomalies: anomalies,
        metadata: metadata,
        created_at: new Date().toISOString()
      })
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`)
    }

    const data = await response.json()
    console.log('✓ Anomaly data uploaded to Supabase:', data)
    return data
  } catch (error) {
    console.error('Failed to upload anomaly data:', error)
    throw error
  }
}

/**
 * Fetch latest anomaly data from Supabase
 * @returns {Promise<Object>} Anomaly data with metadata
 */
export async function fetchAnomalyData() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/satellite_anomalies?order=created_at.desc&limit=1`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (data.length === 0) {
      return null
    }

    console.log('✓ Fetched anomaly data from Supabase:', data[0])
    return data[0]
  } catch (error) {
    console.error('Failed to fetch anomaly data:', error)
    throw error
  }
}

/**
 * Fetch anomaly data from Vercel API (GEE processing)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Anomaly data
 */
export async function fetchFromVercelAPI(params = {}) {
  try {
    const queryParams = new URLSearchParams({
      lat: params.lat || -6.6715,
      lng: params.lng || 107.7285,
      radius: params.radius || 2,
      dateFrom: params.dateFrom || '2024-06-01',
      dateTo: params.dateTo || '2024-10-31'
    })

    const response = await fetch(`/api/satellite-data?${queryParams}`)

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || 'API returned error')
    }

    console.log('✓ Fetched satellite data from Vercel API:', data)
    return data
  } catch (error) {
    console.error('Failed to fetch from Vercel API:', error)
    throw error
  }
}

/**
 * Fetch anomaly data for specific area
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} radiusKm - Search radius in km
 * @returns {Promise<Array>} Anomalies in area
 */
export async function fetchAnomaliesByArea(lat, lng, radiusKm = 5) {
  try {
    // Calculate bounding box
    const latRange = radiusKm / 111
    const lngRange = radiusKm / (111 * Math.cos(lat * Math.PI / 180))
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/satellite_anomalies?` +
      `metadata->>bbox=cs.{${lng-lngRange},${lat-latRange},${lng+lngRange},${lat+latRange}}` +
      `&order=created_at.desc&limit=10`,
      {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`)
    }

    const data = await response.json()
    console.log(`✓ Fetched ${data.length} anomaly records for area`)
    return data
  } catch (error) {
    console.error('Failed to fetch anomalies by area:', error)
    throw error
  }
}

/**
 * Save anomaly data to localStorage as fallback
 * @param {Object} data - Anomaly data to save
 */
export function saveToLocalCache(data) {
  try {
    const cache = {
      data: data,
      timestamp: Date.now(),
      expiry: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
    localStorage.setItem('satellite_anomaly_cache', JSON.stringify(cache))
    console.log('✓ Data cached locally')
  } catch (error) {
    console.error('Failed to cache data:', error)
  }
}

/**
 * Load anomaly data from localStorage cache
 * @returns {Object|null} Cached data or null if expired
 */
export function loadFromLocalCache() {
  try {
    const cached = localStorage.getItem('satellite_anomaly_cache')
    if (!cached) return null

    const { data, timestamp, expiry } = JSON.parse(cached)
    
    // Check if cache is still valid
    if (Date.now() - timestamp > expiry) {
      console.log('Cache expired, clearing...')
      localStorage.removeItem('satellite_anomaly_cache')
      return null
    }

    console.log('✓ Loaded data from local cache')
    return data
  } catch (error) {
    console.error('Failed to load cache:', error)
    return null
  }
}

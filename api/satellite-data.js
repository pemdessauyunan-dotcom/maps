/**
 * Vercel Serverless Function - Google Earth Engine Satellite Data
 * Processes Sentinel-2 imagery and returns anomaly coordinates
 * 
 * Endpoint: /api/satellite-data
 * Method: GET
 * Query params:
 *   - lat: center latitude (optional, default: -6.6715)
 *   - lng: center longitude (optional, default: 107.7285)
 *   - radius: search radius in km (optional, default: 2)
 *   - dateFrom: start date YYYY-MM-DD (optional)
 *   - dateTo: end date YYYY-MM-DD (optional)
 */

// Try to import GEE, but don't fail if not available
let ee = null
try {
  const earthengine = require('earthengine-api')
  ee = earthengine.ee || earthengine.default || earthengine
} catch (error) {
  console.warn('earthengine-api not available, using sample data')
}

// Sample data for when GEE is not configured
const SAMPLE_DATA = {
  metadata: {
    area: 'Kasomalang Kulon',
    bbox: [107.7150, -6.6850, 107.7450, -6.6600],
    date_processed: new Date().toISOString(),
    satellite: 'Sentinel-2',
    index: 'Iron Oxide (B4/B2)',
    total_points: 50,
    value_range: { min: 0.85, max: 2.15 },
    note: 'Sample data - Configure GEE credentials for real-time processing'
  },
  anomalies: [
    {"lat": -6.6715, "lng": 107.7285, "iron_oxide_raw": 2.15, "intensity": 1.0, "anomaly_level": "critical"},
    {"lat": -6.6720, "lng": 107.7290, "iron_oxide_raw": 2.08, "intensity": 0.95, "anomaly_level": "critical"},
    {"lat": -6.6710, "lng": 107.7280, "iron_oxide_raw": 2.02, "intensity": 0.90, "anomaly_level": "critical"},
    {"lat": -6.6725, "lng": 107.7295, "iron_oxide_raw": 1.95, "intensity": 0.85, "anomaly_level": "critical"},
    {"lat": -6.6705, "lng": 107.7275, "iron_oxide_raw": 1.88, "intensity": 0.80, "anomaly_level": "high"},
    {"lat": -6.6730, "lng": 107.7300, "iron_oxide_raw": 1.82, "intensity": 0.75, "anomaly_level": "high"},
    {"lat": -6.6700, "lng": 107.7270, "iron_oxide_raw": 1.75, "intensity": 0.70, "anomaly_level": "high"},
    {"lat": -6.6735, "lng": 107.7305, "iron_oxide_raw": 1.68, "intensity": 0.65, "anomaly_level": "high"},
    {"lat": -6.6695, "lng": 107.7265, "iron_oxide_raw": 1.62, "intensity": 0.60, "anomaly_level": "high"},
    {"lat": -6.6740, "lng": 107.7310, "iron_oxide_raw": 1.55, "intensity": 0.55, "anomaly_level": "moderate"}
  ]
}

// Initialize GEE
let geeInitialized = false
async function initializeGEE() {
  if (!ee) return false
  if (geeInitialized) return true
  
  try {
    await ee.Initialize({
      projectId: process.env.GEE_PROJECT_ID || 'maps-opal-eight'
    })
    geeInitialized = true
    console.log('✓ GEE initialized')
    return true
  } catch (error) {
    console.error('GEE initialization failed:', error.message)
    return false
  }
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Try to initialize GEE
    const geeReady = await initializeGEE()
    
    if (!geeReady) {
      // GEE not available, return sample data
      console.log('GEE not configured, returning sample data')
      return res.status(200).json({
        success: true,
        ...SAMPLE_DATA,
        source: 'sample'
      })
    }

    // Parse query parameters
    const {
      lat = -6.6715,
      lng = 107.7285,
      radius = 2,
      dateFrom = '2024-06-01',
      dateTo = '2024-10-31'
    } = req.query

    const centerLat = parseFloat(lat)
    const centerLng = parseFloat(lng)
    const radiusKm = parseFloat(radius)

    // Calculate bounding box
    const latRange = radiusKm / 111
    const lngRange = radiusKm / (111 * Math.cos(centerLat * Math.PI / 180))
    
    const west = centerLng - lngRange
    const south = centerLat - latRange
    const east = centerLng + lngRange
    const north = centerLat + latRange

    const roi = ee.Geometry.Rectangle([west, south, east, north])

    console.log(`Processing area: ${west.toFixed(4)}, ${south.toFixed(4)} to ${east.toFixed(4)}, ${north.toFixed(4)}`)

    // Fetch Sentinel-2 imagery
    const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterBounds(roi)
      .filterDate(dateFrom, dateTo)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10))
      .median()
      .clip(roi)

    // Calculate Iron Oxide Index (B4/B2)
    const ironOxide = collection.select('B4').divide(collection.select('B2')).rename('IronOxide')

    // Sample pixels
    const samplePoints = ironOxide.sample({
      region: roi,
      scale: 20,
      numPixels: 200,
      geometries: true,
      seed: 42
    })

    // Get data from GEE
    const data = await samplePoints.getInfo()

    // Process and normalize
    const anomalies = []
    const values = []

    for (const feature of data.features) {
      const coords = feature.geometry.coordinates
      const ironValue = feature.properties.IronOxide

      if (ironValue !== null && ironValue !== undefined) {
        values.push(ironValue)
        anomalies.push({
          lat: coords[1],
          lng: coords[0],
          iron_oxide_raw: Math.round(ironValue * 10000) / 10000
        })
      }
    }

    // Normalize to 0-1 scale
    if (values.length > 0) {
      const minVal = Math.min(...values)
      const maxVal = Math.max(...values)
      const valRange = maxVal - minVal || 1

      anomalies.forEach(point => {
        const normalized = (point.iron_oxide_raw - minVal) / valRange
        point.intensity = Math.round(Math.max(0, Math.min(1, normalized)) * 1000) / 1000
        point.anomaly_level = 
          normalized > 0.8 ? 'critical' :
          normalized > 0.6 ? 'high' :
          normalized > 0.4 ? 'moderate' : 'low'
      })
    }

    // Sort by intensity
    anomalies.sort((a, b) => b.intensity - a.intensity)

    // Return response
    return res.status(200).json({
      success: true,
      metadata: {
        area: 'Custom Area',
        bbox: [west, south, east, north],
        date_processed: new Date().toISOString(),
        satellite: 'Sentinel-2',
        index: 'Iron Oxide (B4/B2)',
        total_points: anomalies.length,
        value_range: {
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0
        },
        query: {
          center: { lat: centerLat, lng: centerLng },
          radius_km: radiusKm,
          date_range: { from: dateFrom, to: dateTo }
        }
      },
      anomalies: anomalies,
      source: 'gee'
    })

  } catch (error) {
    console.error('API Error:', error)
    
    // Return sample data on error
    return res.status(200).json({
      success: true,
      ...SAMPLE_DATA,
      source: 'sample',
      error: error.message
    })
  }
}

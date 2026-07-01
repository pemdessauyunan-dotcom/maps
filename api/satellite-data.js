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

import ee from 'google-earthengine'

// Initialize GEE
let geeInitialized = false
async function initializeGEE() {
  if (geeInitialized) return
  
  try {
    await ee.Initialize({
      projectId: process.env.GEE_PROJECT_ID || 'maps-opal-eight'
    })
    geeInitialized = true
    console.log('✓ GEE initialized')
  } catch (error) {
    console.error('GEE initialization failed:', error)
    throw error
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
    await initializeGEE()

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
      anomalies: anomalies
    })

  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to process satellite data'
    })
  }
}

/**
 * Satellite Data API v2 — Real-Time & Static Hybrid
 * Serves real-time computed satellite indices OR cached GEE data
 * 
 * Endpoint: /api/satellite-data?lat=-6.68&lng=107.73&radius=1.0&realtime=true
 */

import { readFileSync } from 'fs'
import { join } from 'path'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const realtime = req.query.realtime !== 'false'
  const lat = parseFloat(req.query.lat) || -6.6715
  const lng = parseFloat(req.query.lng) || 107.7285

  try {
    if (realtime) {
      // === REAL-TIME MODE: compute indices on-the-fly ===
      const { default: realtimeHandler } = await import('./realtime-indices.js')
      // Re-dispatch with query params
      req.query.samples = req.query.samples || '80'
      return await realtimeHandler(req, res)
    }

    // === STATIC MODE: serve cached GEE data ===
    const dataPath = join(process.cwd(), 'public', 'anomaly_data.json')
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    
    return res.status(200).json({
      success: true,
      ...data,
      source: 'gee-cached',
      note: 'Gunakan ?realtime=true untuk data real-time berdasarkan lokasi'
    })
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}
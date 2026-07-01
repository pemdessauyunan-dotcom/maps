/**
 * Vercel Serverless Function - Satellite Anomaly Data
 * Serves real GEE-processed Sentinel-2 iron oxide anomaly data
 * 
 * Endpoint: /api/satellite-data
 * Method: GET
 */

import { readFileSync } from 'fs'
import { join } from 'path'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Serve real anomaly data from bundled JSON
    const dataPath = join(process.cwd(), 'public', 'anomaly_data.json')
    const data = JSON.parse(readFileSync(dataPath, 'utf-8'))
    
    return res.status(200).json({
      success: true,
      ...data,
      source: 'gee-real'
    })
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ success: false, error: error.message })
  }
}

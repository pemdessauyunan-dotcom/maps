/**
 * Export API — Server-side export
 * POST /api/export
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { format, data } = req.body || {}
  const formats = ['csv', 'geojson', 'gpx', 'kml', 'shapefile']
  if (!format || !formats.includes(format)) return res.status(400).json({ error: 'Invalid format: ' + format })
  return res.status(200).json({ success: true, format, points: data?.length || 0, timestamp: new Date().toISOString() })
}
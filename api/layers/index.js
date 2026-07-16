/**
 * Layers API — Manage map layers
 * GET /api/layers
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  return res.status(200).json({
    success: true,
    layers: [
      { id: 'satellite', name: 'Satellite', type: 'basemap', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
      { id: 'terrain', name: 'Terrain', type: 'basemap', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png' },
      { id: 'osm', name: 'OpenStreetMap', type: 'basemap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' },
      { id: 'thermal', name: 'Thermal Overlay', type: 'overlay', url: '/api/thermal' },
      { id: 'geology', name: 'Geology', type: 'overlay', url: null, source: 'Macrostrat' },
    ],
  })
}
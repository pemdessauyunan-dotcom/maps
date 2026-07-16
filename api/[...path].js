/**
 * API Gateway — Catch-All Router
 * Routes to specific handlers based on path
 */
export default async function handler(req, res) {
  const path = req.url.split('?')[0].replace(/^\/api\//, '')

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // Auth
    if (path === 'auth/login') return (await import('./auth/login.js')).default(req, res)
    if (path === 'auth/register') return (await import('./auth/register.js')).default(req, res)
    if (path === 'auth/verify') return (await import('./auth/verify.js')).default(req, res)

    // Survey
    if (path === 'survey' || path === 'survey/') return (await import('./survey/index.js')).default(req, res)
    if (path.startsWith('survey/')) return (await import('./survey/[id].js')).default(req, res)

    // Sync
    if (path === 'sync') return (await import('./survey/sync.js')).default(req, res)

    // Export
    if (path === 'export') return (await import('./export/index.js')).default(req, res)

    // Layers
    if (path === 'layers') return (await import('./layers/index.js')).default(req, res)

    // Tiles
    if (path.startsWith('tiles/')) return (await import('./tiles/proxy.js')).default(req, res)

    // Thermal (legacy)
    if (path === 'thermal' || path === 'thermal.js') {
      return (await import('./thermal.js')).default(req, res)
    }

    // Health
    if (path === 'health') {
      return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' })
    }

    return res.status(404).json({ error: `Endpoint not found: ${path}` })
  } catch (err) {
    console.error('API Error:', err)
    return res.status(500).json({ error: 'Internal server error', message: err.message })
  }
}
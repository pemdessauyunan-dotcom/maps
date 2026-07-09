/**
 * API Catch-All Router
 * Routes requests to the correct handler based on the path
 */
export default async function handler(req, res) {
  const path = req.url.split('?')[0].replace(/^\/api\//, '')
  
  // Route to specific handlers
  if (path === 'thermal' || path === 'thermal.js' || path === 'realtime-indices' || path === 'realtime-indices.js') {
    const { default: thermalHandler } = await import('./thermal.js')
    return thermalHandler(req, res)
  }
  
  // Health check
  if (path === 'health') {
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
  }
  
  // Default: try individual handler
  try {
    const mod = await import(`./${path}.js`)
    return mod.default(req, res)
  } catch {
    return res.status(404).json({ error: `API endpoint not found: ${path}`, available: ['thermal'] })
  }
}
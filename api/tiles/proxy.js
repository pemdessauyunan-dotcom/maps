/**
 * Tiles Proxy — Proxy tile requests to external tile servers
 * GET /api/tiles/:layer/:z/:x/:y
 */
export default async function handler(req, res) {
  const { layer, z, x, y } = req.query
  if (!layer || !z || !x || !y) return res.status(400).json({ error: 'Missing tile params' })

  const tileUrls = {
    geology: `https://{s}.tile.opentopomap.org/${z}/${x}/${y}.png`,
    thermal: null, // computed on-the-fly
  }

  const url = tileUrls[layer]
  if (!url) return res.status(404).json({ error: 'Layer not found' })

  try {
    const resp = await fetch(url.replace('{s}', 'a'))
    if (!resp.ok) return res.status(502).json({ error: 'Tile fetch failed' })
    const buffer = await resp.arrayBuffer()
    res.setHeader('Content-Type', resp.headers.get('Content-Type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    return res.status(200).send(Buffer.from(buffer))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
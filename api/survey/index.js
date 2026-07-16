/**
 * Survey API — CRUD operations
 * GET /api/survey — list all surveys
 * POST /api/survey — create new survey
 */
export default async function handler(req, res) {
  switch (req.method) {
    case 'GET': return res.status(200).json({ success: true, surveys: [], message: 'Survey list — database pending' })
    case 'POST': {
      const { name, points, metadata } = req.body || {}
      if (!name) return res.status(400).json({ error: 'Survey name required' })
      return res.status(201).json({ success: true, survey: { id: `survey-${Date.now()}`, name, pointCount: points?.length || 0, createdAt: new Date().toISOString() } })
    }
    default: return res.status(405).json({ error: 'Method not allowed' })
  }
}
/**
 * Survey — Sync offline queue
 * POST /api/survey/sync
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { operations } = req.body || {}
  return res.status(200).json({
    success: true,
    synced: operations?.length || 0,
    timestamp: new Date().toISOString(),
  })
}
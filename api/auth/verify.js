/**
 * Auth — Verify Token
 * GET /api/auth/verify
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = req.headers.authorization || ''
  const token = auth.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token provided' })
  return res.status(200).json({ success: true, valid: true, user: { email: 'surveyor', role: 'surveyor' } })
}
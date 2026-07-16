/**
 * Auth — Register
 * POST /api/auth/register
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { email, password, name } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  return res.status(201).json({ success: true, message: 'Registration endpoint — database pending' })
}
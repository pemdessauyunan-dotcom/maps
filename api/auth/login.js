/**
 * Auth — Login
 * POST /api/auth/login
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { email, password } = req.body || {}
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    // For now: simple JWT-less auth
    // In production: use JWT with proper password hashing
    const token = Buffer.from(`${email}:${Date.now()}`).toString('base64')

    return res.status(200).json({
      success: true,
      token,
      user: { email, name: email.split('@')[0], role: 'surveyor' },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
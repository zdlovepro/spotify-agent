export function requireSpotifyAccessToken(req, res, next) {
  const header = req.headers.authorization || ''

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Spotify access token' })
  }

  req.accessToken = header.slice('Bearer '.length).trim()
  next()
}

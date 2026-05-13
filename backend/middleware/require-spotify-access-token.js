import { asyncHandler } from './async-handler.js'
import { resolveLocalUserFromRequest } from './optional-local-user.js'
import {
  getProviderLink,
  refreshProviderToken,
} from '../services/provider/provider-link-service.js'

const LOCAL_SESSION_PREFIX = 'am_st_'

function extractBearerToken(req) {
  const header = req.headers.authorization || ''

  if (!header.startsWith('Bearer ')) {
    return ''
  }

  return header.slice('Bearer '.length).trim()
}

export const requireSpotifyAccessToken = asyncHandler(async (req, res, next) => {
  const bearerToken = extractBearerToken(req)

  if (bearerToken && !bearerToken.startsWith(LOCAL_SESSION_PREFIX)) {
    req.accessToken = bearerToken
    return next()
  }

  const localUser = resolveLocalUserFromRequest(req)

  if (!localUser?.id) {
    return res.status(401).json({
      error: 'Local user authentication required',
      code: 'local_user_required',
    })
  }

  req.localUser = req.localUser || localUser
  req.localUserId = req.localUserId || localUser.id
  req.localSessionToken = req.localSessionToken || localUser.sessionToken
  req.localSession = req.localSession || localUser.session
  req.isLocalUserAuthenticated = true

  const providerLink = getProviderLink(localUser.id, 'spotify')

  if (!providerLink) {
    return res.status(403).json({
      error: 'Spotify provider is not connected',
      code: 'spotify_not_connected',
    })
  }

  const activeProviderLink = await refreshProviderToken(providerLink)

  if (!activeProviderLink?.accessToken) {
    return res.status(403).json({
      error: 'Spotify provider is not connected',
      code: 'spotify_not_connected',
    })
  }

  req.spotifyProviderLink = activeProviderLink
  req.accessToken = activeProviderLink.accessToken
  next()
})

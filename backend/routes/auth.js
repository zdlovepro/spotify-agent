import { Router } from 'express'
import crypto from 'crypto'
import env from '../config/env.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { findUserById } from '../services/auth/user-service.js'
import {
  consumeOAuthPendingState,
  pruneExpiredOAuthPendingStates,
} from '../services/auth/oauth-state-service.js'
import { linkProvider } from '../services/provider/provider-link-service.js'
import {
  buildSpotifyLinkPayload,
  exchangeSpotifyToken,
  fetchSpotifyProfile,
  SPOTIFY_PROVIDER_NAME,
  SPOTIFY_SCOPES,
} from '../services/provider/spotify-provider-service.js'

const router = Router()
const STATE_TTL_MS = 10 * 60 * 1000

const pendingStates = new Map()

function generateRandomString(length) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length)
}

function pruneExpiredStates() {
  const now = Date.now()

  for (const [state, expiresAt] of pendingStates.entries()) {
    if (expiresAt <= now) {
      pendingStates.delete(state)
    }
  }
}

function pruneAllSpotifyPendingStates() {
  pruneExpiredStates()
  pruneExpiredOAuthPendingStates(SPOTIFY_PROVIDER_NAME)
}

function normalizeFrontendOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return ''
  }

  try {
    const url = new URL(value)
    const configuredUrl = new URL(env.frontendUri)
    const isConfiguredOrigin = url.origin === configuredUrl.origin
    const isLoopbackHost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const isVitePort = Number(url.port) >= 5173 && Number(url.port) <= 5179
    const isLoopbackViteOrigin =
      url.protocol === 'http:' && isLoopbackHost && isVitePort

    return isConfiguredOrigin || isLoopbackViteOrigin ? url.origin : ''
  } catch {
    return ''
  }
}

function buildFrontendRedirect(pathname, params = {}, frontendOrigin = env.frontendUri) {
  const normalizedPath =
    typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/'
  const query = new URLSearchParams()
  const redirectOrigin =
    normalizeFrontendOrigin(frontendOrigin) || normalizeFrontendOrigin(env.frontendUri)

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, String(value))
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : ''
  return `${redirectOrigin}${normalizedPath}${suffix}`
}

router.get('/login', (req, res) => {
  pruneAllSpotifyPendingStates()

  const state = generateRandomString(16)
  pendingStates.set(state, Date.now() + STATE_TTL_MS)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.spotifyClientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: env.spotifyRedirectUri,
    state,
    show_dialog: 'true',
  })

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`)
})

router.get(
  '/spotify/callback',
  asyncHandler(async (req, res) => {
    pruneAllSpotifyPendingStates()

    const { code, state, error } = req.query

    const providerStateEntry =
      state && typeof state === 'string'
        ? consumeOAuthPendingState(state, SPOTIFY_PROVIDER_NAME)
        : null

    if (error || !code) {
      if (providerStateEntry) {
        return res.redirect(
          buildFrontendRedirect(
            providerStateEntry.returnTo,
            {
              provider: SPOTIFY_PROVIDER_NAME,
              error: error || 'access_denied',
            },
            providerStateEntry.frontendOrigin,
          ),
        )
      }

      return res.redirect(
        buildFrontendRedirect('/', {
          provider: SPOTIFY_PROVIDER_NAME,
          error: error || 'access_denied',
        }),
      )
    }

    if (providerStateEntry) {
      const localUser = findUserById(providerStateEntry.localUserId)

      if (!localUser) {
        return res.redirect(
          buildFrontendRedirect(
            providerStateEntry.returnTo,
            {
              provider: SPOTIFY_PROVIDER_NAME,
              error: 'local_auth_required',
            },
            providerStateEntry.frontendOrigin,
          ),
        )
      }

      try {
        const tokenData = await exchangeSpotifyToken(
          new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: env.spotifyRedirectUri,
          }),
        )

        const profile = await fetchSpotifyProfile(tokenData.access_token)

        await linkProvider(
          buildSpotifyLinkPayload({
            userId: localUser.id,
            tokenData,
            profile,
          }),
        )

        return res.redirect(
          buildFrontendRedirect(
            providerStateEntry.returnTo,
            {
              provider: SPOTIFY_PROVIDER_NAME,
              connected: 1,
            },
            providerStateEntry.frontendOrigin,
          ),
        )
      } catch (error_) {
        const message =
          error_.response?.data?.error_description ||
          error_.response?.data?.error ||
          error_.message ||
          'provider_link_failed'

        return res.redirect(
          buildFrontendRedirect(
            providerStateEntry.returnTo,
            {
              provider: SPOTIFY_PROVIDER_NAME,
              error: message,
            },
            providerStateEntry.frontendOrigin,
          ),
        )
      }
    }

    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${env.frontendUri}?error=state_mismatch`)
    }

    pendingStates.delete(state)

    try {
      const tokenData = await exchangeSpotifyToken(
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.spotifyRedirectUri,
        }),
      )

      const params = new URLSearchParams({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: String(tokenData.expires_in),
      })

      res.redirect(`${env.frontendUri}?${params.toString()}`)
    } catch (error_) {
      const message =
        error_.response?.data?.error_description ||
        error_.response?.data?.error ||
        error_.message ||
        'token_exchange_failed'

      res.redirect(`${env.frontendUri}?error=${encodeURIComponent(message)}`)
    }
  }),
)

router.get(
  '/refresh_token',
  asyncHandler(async (req, res) => {
    const { refresh_token: refreshToken } = req.query

    if (!refreshToken) {
      return res.status(400).json({ error: 'refresh_token is required' })
    }

    try {
      const tokenData = await exchangeSpotifyToken(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      )

      res.json({
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
      })
    } catch (error_) {
      const message =
        error_.response?.data?.error_description ||
        error_.response?.data?.error ||
        error_.message ||
        'refresh_failed'

      res.status(400).json({ error: message })
    }
  }),
)

export default router

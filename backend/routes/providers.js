import crypto from 'crypto'
import { Router } from 'express'
import env from '../config/env.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { getSession } from '../services/auth/session-service.js'
import { findUserById } from '../services/auth/user-service.js'
import {
  linkProvider,
  listProviderLinks,
  refreshProviderToken,
  unlinkProvider,
} from '../services/provider/provider-link-service.js'
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

function pruneExpiredStates() {
  const now = Date.now()

  for (const [state, entry] of pendingStates.entries()) {
    if (entry.expiresAt <= now) {
      pendingStates.delete(state)
    }
  }
}

function buildFrontendRedirect(pathname, params = {}) {
  const normalizedPath =
    typeof pathname === 'string' && pathname.startsWith('/') ? pathname : '/'
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, String(value))
    }
  }

  const suffix = query.toString() ? `?${query.toString()}` : ''
  return `${env.frontendUri}${normalizedPath}${suffix}`
}

function shouldReturnJson(req) {
  return (
    req.query.format === 'json' ||
    (req.header('accept') || '').includes('application/json')
  )
}

router.get(
  '/',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    const providerLinks = await Promise.all(
      listProviderLinks(req.localUserId).map(async (providerLink) => {
        const activeLink =
          providerLink.providerName === SPOTIFY_PROVIDER_NAME
            ? await refreshProviderToken(providerLink)
            : providerLink

        return {
          provider: activeLink.providerName,
          connected: true,
          displayName: activeLink.displayName,
          sourceType: activeLink.sourceType,
          sourceId: activeLink.sourceId,
          scopes: activeLink.scopes,
          profile: activeLink.profile,
          linkedAt: activeLink.createdAt,
          updatedAt: activeLink.updatedAt,
        }
      }),
    )

    const spotifyLink = providerLinks.find(
      (item) => item.provider === SPOTIFY_PROVIDER_NAME,
    )

    res.json({
      userId: req.localUserId,
      items: [
        {
          provider: SPOTIFY_PROVIDER_NAME,
          connected: Boolean(spotifyLink),
          ...(spotifyLink || {}),
        },
      ],
    })
  }),
)

router.get(
  '/spotify/connect',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    pruneExpiredStates()

    const state = crypto.randomBytes(16).toString('hex')
    const returnTo =
      typeof req.query.return_to === 'string' && req.query.return_to.startsWith('/')
        ? req.query.return_to
        : '/'

    pendingStates.set(state, {
      localUserId: req.localUserId,
      localSessionToken: req.localSessionToken,
      returnTo,
      expiresAt: Date.now() + STATE_TTL_MS,
    })

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.spotifyClientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: env.spotifyRedirectUri,
      state,
    })

    const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`

    if (shouldReturnJson(req)) {
      return res.json({
        provider: SPOTIFY_PROVIDER_NAME,
        authorizeUrl,
      })
    }

    res.redirect(authorizeUrl)
  }),
)

router.get(
  '/spotify/callback',
  asyncHandler(async (req, res) => {
    pruneExpiredStates()

    const { code, state, error } = req.query

    if (error || !code || !state) {
      return res.redirect(
        buildFrontendRedirect('/', {
          provider: SPOTIFY_PROVIDER_NAME,
          error: error || 'access_denied',
        }),
      )
    }

    const stateEntry = pendingStates.get(state)

    if (!stateEntry) {
      return res.redirect(
        buildFrontendRedirect('/', {
          provider: SPOTIFY_PROVIDER_NAME,
          error: 'state_mismatch',
        }),
      )
    }

    pendingStates.delete(state)

    const session = getSession(stateEntry.localSessionToken)
    const localUser =
      session && session.userId === stateEntry.localUserId
        ? findUserById(stateEntry.localUserId)
        : null

    if (!session || !localUser) {
      return res.redirect(
        buildFrontendRedirect(stateEntry.returnTo, {
          provider: SPOTIFY_PROVIDER_NAME,
          error: 'local_auth_required',
        }),
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

      res.redirect(
        buildFrontendRedirect(stateEntry.returnTo, {
          provider: SPOTIFY_PROVIDER_NAME,
          connected: 1,
        }),
      )
    } catch (error_) {
      const message =
        error_.response?.data?.error_description ||
        error_.response?.data?.error ||
        error_.message ||
        'provider_link_failed'

      res.redirect(
        buildFrontendRedirect(stateEntry.returnTo, {
          provider: SPOTIFY_PROVIDER_NAME,
          error: message,
        }),
      )
    }
  }),
)

router.delete(
  '/spotify/disconnect',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    const removed = unlinkProvider(req.localUserId, SPOTIFY_PROVIDER_NAME)

    res.json({
      provider: SPOTIFY_PROVIDER_NAME,
      disconnected: removed,
    })
  }),
)

export default router

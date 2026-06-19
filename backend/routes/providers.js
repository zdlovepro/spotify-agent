import crypto from 'crypto'
import { Router } from 'express'
import env from '../config/env.js'
import { asyncHandler } from '../middleware/async-handler.js'
import { requireLocalUser } from '../middleware/require-local-user.js'
import { findUserById } from '../services/auth/user-service.js'
import {
  consumeOAuthPendingState,
  createOAuthPendingState,
  pruneExpiredOAuthPendingStates,
} from '../services/auth/oauth-state-service.js'
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
import {
  importAllSpotifyPlaylists,
  importSpotifyPlaylist,
  syncSpotifySavedTracks,
} from '../services/provider/spotify-library-import-service.js'

const router = Router()
const STATE_TTL_MS = 10 * 60 * 1000

function pruneExpiredStates() {
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

function resolveFrontendOrigin(req) {
  return (
    normalizeFrontendOrigin(req.header('origin')) ||
    normalizeFrontendOrigin(req.header('referer')) ||
    normalizeFrontendOrigin(env.frontendUri)
  )
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

function shouldReturnJson(req) {
  return (
    req.query.format === 'json' ||
    (req.header('accept') || '').includes('application/json')
  )
}

function buildSpotifyImportErrorPayload(error) {
  return {
    provider: SPOTIFY_PROVIDER_NAME,
    message: error.message || 'spotify_import_failed',
    error: error.message || 'spotify_import_failed',
    ...(error.code ? { code: error.code } : {}),
    ...(error.stage ? { stage: error.stage } : {}),
    ...(Array.isArray(error.missingScopes) ? { missingScopes: error.missingScopes } : {}),
    ...(error.details ? { details: error.details } : {}),
  }
}

function getSpotifyImportResponseStatus(result) {
  if ((result?.importedCount || 0) > 0) {
    return 201
  }

  if ((result?.failedCount || 0) > 0) {
    return 207
  }

  return 200
}

router.get(
  '/',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    const providerLinks = await Promise.all(
      listProviderLinks(req.localUserId).map(async (providerLink) => {
        try {
          const activeLink =
            providerLink.providerName === SPOTIFY_PROVIDER_NAME
              ? await refreshProviderToken(providerLink)
              : providerLink

          if (
            providerLink.providerName === SPOTIFY_PROVIDER_NAME &&
            !activeLink?.accessToken
          ) {
            return null
          }

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
        } catch (error) {
          if (
            providerLink.providerName === SPOTIFY_PROVIDER_NAME &&
            ['spotify_reconnect_required', 'spotify_token_unavailable'].includes(
              error.code,
            )
          ) {
            return null
          }

          throw error
        }
      }),
    )
    const resolvedProviderLinks = providerLinks.filter(Boolean)

    const spotifyLink = resolvedProviderLinks.find(
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

    createOAuthPendingState({
      state,
      providerName: SPOTIFY_PROVIDER_NAME,
      localUserId: req.localUserId,
      returnTo,
      frontendOrigin: resolveFrontendOrigin(req),
      ttlMs: STATE_TTL_MS,
    })

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.spotifyClientId,
      scope: SPOTIFY_SCOPES,
      redirect_uri: env.spotifyRedirectUri,
      state,
      show_dialog: 'true',
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

    const stateEntry =
      state && typeof state === 'string'
        ? consumeOAuthPendingState(state, SPOTIFY_PROVIDER_NAME)
        : null

    if (error || !code || !state) {
      return res.redirect(
        buildFrontendRedirect(
          stateEntry?.returnTo || '/',
          {
            provider: SPOTIFY_PROVIDER_NAME,
            error: error || 'access_denied',
          },
          stateEntry?.frontendOrigin,
        ),
      )
    }

    if (!stateEntry) {
      return res.redirect(
        buildFrontendRedirect('/', {
          provider: SPOTIFY_PROVIDER_NAME,
          error: 'state_mismatch',
        }),
      )
    }

    const localUser = findUserById(stateEntry.localUserId)

    if (!localUser) {
      return res.redirect(
        buildFrontendRedirect(
          stateEntry.returnTo,
          {
            provider: SPOTIFY_PROVIDER_NAME,
            error: 'local_auth_required',
          },
          stateEntry.frontendOrigin,
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

      res.redirect(
        buildFrontendRedirect(
          stateEntry.returnTo,
          {
            provider: SPOTIFY_PROVIDER_NAME,
            connected: 1,
          },
          stateEntry.frontendOrigin,
        ),
      )
    } catch (error_) {
      const message =
        error_.response?.data?.error_description ||
        error_.response?.data?.error ||
        error_.message ||
        'provider_link_failed'

      res.redirect(
        buildFrontendRedirect(
          stateEntry.returnTo,
          {
            provider: SPOTIFY_PROVIDER_NAME,
            error: message,
          },
          stateEntry.frontendOrigin,
        ),
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

router.post(
  '/spotify/import/playlists',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    try {
      const result = await importAllSpotifyPlaylists(req.localUserId)

      res.status(getSpotifyImportResponseStatus(result)).json({
        provider: SPOTIFY_PROVIDER_NAME,
        ...result,
      })
    } catch (error) {
      if (error?.code?.startsWith('spotify_')) {
        return res
          .status(error.status || 403)
          .json(buildSpotifyImportErrorPayload(error))
      }

      throw error
    }
  }),
)

router.post(
  '/spotify/import/playlists/:spotifyPlaylistId',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    try {
      const result = await importSpotifyPlaylist(
        req.localUserId,
        req.params.spotifyPlaylistId,
      )

      res.status(result?.skipped ? 200 : 201).json({
        provider: SPOTIFY_PROVIDER_NAME,
        ...result,
      })
    } catch (error) {
      if (error?.code?.startsWith('spotify_')) {
        return res
          .status(error.status || 403)
          .json(buildSpotifyImportErrorPayload(error))
      }

      throw error
    }
  }),
)

router.post(
  '/spotify/sync/saved-tracks',
  requireLocalUser,
  asyncHandler(async (req, res) => {
    const result = await syncSpotifySavedTracks(req.localUserId)

    res.status(201).json({
      provider: SPOTIFY_PROVIDER_NAME,
      ...result,
    })
  }),
)

export default router

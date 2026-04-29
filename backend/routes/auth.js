import { Router } from 'express'
import axios from 'axios'
import crypto from 'crypto'
import env from '../config/env.js'
import { asyncHandler } from '../middleware/async-handler.js'

const router = Router()
const STATE_TTL_MS = 10 * 60 * 1000

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
].join(' ')

const pendingStates = new Map()

function createClientCredentials() {
  return Buffer.from(
    `${env.spotifyClientId}:${env.spotifyClientSecret}`,
  ).toString('base64')
}

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

async function exchangeSpotifyToken(body) {
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    body.toString(),
    {
      headers: {
        Authorization: `Basic ${createClientCredentials()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )

  return response.data
}

router.get('/login', (req, res) => {
  pruneExpiredStates()

  const state = generateRandomString(16)
  pendingStates.set(state, Date.now() + STATE_TTL_MS)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.spotifyClientId,
    scope: SCOPES,
    redirect_uri: env.spotifyRedirectUri,
    state,
  })

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`)
})

router.get(
  '/spotify/callback',
  asyncHandler(async (req, res) => {
    pruneExpiredStates()

    const { code, state, error } = req.query

    if (error || !code) {
      return res.redirect(
        `${env.frontendUri}?error=${encodeURIComponent(error || 'access_denied')}`,
      )
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

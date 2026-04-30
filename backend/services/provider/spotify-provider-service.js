import axios from 'axios'
import env from '../../config/env.js'

export const SPOTIFY_PROVIDER_NAME = 'spotify'

export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
].join(' ')

function createClientCredentials() {
  return Buffer.from(
    `${env.spotifyClientId}:${env.spotifyClientSecret}`,
  ).toString('base64')
}

export async function exchangeSpotifyToken(body) {
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

export async function fetchSpotifyProfile(accessToken) {
  const response = await axios.get('https://api.spotify.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  return response.data
}

export function buildSpotifyLinkPayload({
  userId,
  tokenData,
  profile,
  scopes = SPOTIFY_SCOPES,
}) {
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null

  return {
    userId,
    providerName: SPOTIFY_PROVIDER_NAME,
    providerUserId: profile.id,
    sourceType: 'spotify:user',
    sourceId: profile.id,
    displayName: profile.display_name || profile.id,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    tokenExpiresAt: expiresAt,
    scopes: typeof scopes === 'string' ? scopes.split(' ').filter(Boolean) : scopes,
    profile,
    metadata: {
      linkedVia: 'oauth',
    },
  }
}

export default {
  SPOTIFY_PROVIDER_NAME,
  SPOTIFY_SCOPES,
  exchangeSpotifyToken,
  fetchSpotifyProfile,
  buildSpotifyLinkPayload,
}

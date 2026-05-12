import axios from 'axios'
import { buildCacheKey, getOrSetCache } from './cache.js'

const spotifyApi = axios.create({
  baseURL: 'https://api.spotify.com/v1',
  timeout: 10000,
})

function createSpotifyApiError(error, fallbackMessage) {
  const status = error.response?.status || 400
  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.error ||
    error.message ||
    fallbackMessage

  const normalized = new Error(message)
  normalized.status = status
  normalized.details = error.response?.data

  return normalized
}

async function spotifyGet(path, accessToken, params = {}, { ttlMs = 0 } = {}) {
  const cacheKey = buildCacheKey({
    path,
    params,
    accessTokenSuffix: accessToken.slice(-12),
  })

  return getOrSetCache(cacheKey, ttlMs, async () => {
    try {
      const response = await spotifyApi.get(path, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params,
      })

      return response.data
    } catch (error) {
      throw createSpotifyApiError(error, `Spotify request failed for ${path}`)
    }
  })
}

async function spotifyMutation(
  method,
  path,
  accessToken,
  { params = undefined, data = undefined } = {},
) {
  try {
    const response = await spotifyApi.request({
      method,
      url: path,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params,
      data,
    })

    return response.data ?? null
  } catch (error) {
    throw createSpotifyApiError(error, `Spotify request failed for ${path}`)
  }
}

export function parseInteger(value, defaultValue, { min = 0, max = 50 } = {}) {
  const parsed = Number.parseInt(value ?? defaultValue, 10)

  if (Number.isNaN(parsed)) {
    return defaultValue
  }

  return Math.min(max, Math.max(min, parsed))
}

export function parseCsv(value) {
  if (!value) {
    return []
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export async function getCurrentUserProfile(accessToken) {
  return spotifyGet('/me', accessToken, {}, { ttlMs: 60_000 })
}

export async function getUserPlaylists(accessToken, { limit, offset }) {
  return spotifyGet(
    '/me/playlists',
    accessToken,
    { limit, offset },
    { ttlMs: 30_000 },
  )
}

export async function getUserSavedTracks(
  accessToken,
  { limit, offset, market },
) {
  return spotifyGet(
    '/me/tracks',
    accessToken,
    { limit, offset, market },
    { ttlMs: 30_000 },
  )
}

export async function getUserSavedAlbums(accessToken, { limit, offset, market }) {
  return spotifyGet(
    '/me/albums',
    accessToken,
    { limit, offset, market },
    { ttlMs: 30_000 },
  )
}

export async function getPlaylist(accessToken, playlistId, { market }) {
  return spotifyGet(
    `/playlists/${playlistId}`,
    accessToken,
    { market },
    { ttlMs: 30_000 },
  )
}

export async function getPlaylistTracks(
  accessToken,
  playlistId,
  { limit, offset, market },
) {
  return spotifyGet(
    `/playlists/${playlistId}/tracks`,
    accessToken,
    { limit, offset, market },
    { ttlMs: 30_000 },
  )
}

export async function searchSpotify(
  accessToken,
  { q, type, limit, offset, market, include_external },
) {
  return spotifyGet(
    '/search',
    accessToken,
    {
      q,
      type,
      limit,
      offset,
      market,
      include_external,
    },
    { ttlMs: 15_000 },
  )
}

export async function getTrack(accessToken, trackId, { market }) {
  return spotifyGet(
    `/tracks/${trackId}`,
    accessToken,
    { market },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getAlbum(accessToken, albumId, { market }) {
  return spotifyGet(
    `/albums/${albumId}`,
    accessToken,
    { market },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getArtist(accessToken, artistId) {
  return spotifyGet(`/artists/${artistId}`, accessToken, {}, { ttlMs: 5 * 60_000 })
}

export async function getArtistTopTracks(accessToken, artistId, { market }) {
  return spotifyGet(
    `/artists/${artistId}/top-tracks`,
    accessToken,
    { market },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getFeaturedPlaylists(
  accessToken,
  { country, locale, timestamp, limit, offset },
) {
  return spotifyGet(
    '/browse/featured-playlists',
    accessToken,
    {
      country,
      locale,
      timestamp,
      limit,
      offset,
    },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getCategories(
  accessToken,
  { country, locale, limit, offset },
) {
  return spotifyGet(
    '/browse/categories',
    accessToken,
    {
      country,
      locale,
      limit,
      offset,
    },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getNewReleases(accessToken, { country, limit, offset }) {
  return spotifyGet(
    '/browse/new-releases',
    accessToken,
    {
      country,
      limit,
      offset,
    },
    { ttlMs: 5 * 60_000 },
  )
}

export async function getAvailableGenreSeeds(accessToken) {
  return spotifyGet(
    '/recommendations/available-genre-seeds',
    accessToken,
    {},
    { ttlMs: 24 * 60 * 60_000 },
  )
}

export async function getRecommendations(
  accessToken,
  { seed_artists, seed_tracks, seed_genres, limit, market },
) {
  return spotifyGet(
    '/recommendations',
    accessToken,
    {
      seed_artists,
      seed_tracks,
      seed_genres,
      limit,
      market,
    },
    { ttlMs: 30_000 },
  )
}

export async function getUserTopItems(
  accessToken,
  type,
  { time_range, limit, offset },
) {
  return spotifyGet(
    `/me/top/${type}`,
    accessToken,
    {
      time_range,
      limit,
      offset,
    },
    { ttlMs: 60_000 },
  )
}

export async function getAvailableDevices(accessToken) {
  return spotifyGet('/me/player/devices', accessToken, {}, { ttlMs: 5_000 })
}

export async function getCurrentPlaybackState(accessToken) {
  return spotifyGet('/me/player', accessToken, {}, { ttlMs: 3_000 })
}

export async function transferPlayback(accessToken, { deviceId, play = true }) {
  return spotifyMutation('PUT', '/me/player', accessToken, {
    data: {
      device_ids: [deviceId],
      play: Boolean(play),
    },
  })
}

export async function startOrResumePlayback(
  accessToken,
  { deviceId = '', uris = null, contextUri = '', offset = null, positionMs = null } = {},
) {
  const payload = {}

  if (Array.isArray(uris) && uris.length) {
    payload.uris = uris
  }

  if (contextUri) {
    payload.context_uri = contextUri
  }

  if (offset && typeof offset === 'object') {
    const normalizedOffset = {}

    if (typeof offset.uri === 'string' && offset.uri.trim()) {
      normalizedOffset.uri = offset.uri.trim()
    }

    if (Number.isFinite(Number(offset.position)) && Number(offset.position) >= 0) {
      normalizedOffset.position = Number(offset.position)
    }

    if (Object.keys(normalizedOffset).length) {
      payload.offset = normalizedOffset
    }
  }

  if (Number.isFinite(Number(positionMs)) && Number(positionMs) >= 0) {
    payload.position_ms = Number(positionMs)
  }

  return spotifyMutation('PUT', '/me/player/play', accessToken, {
    params: deviceId ? { device_id: deviceId } : undefined,
    data: Object.keys(payload).length ? payload : undefined,
  })
}

export async function pausePlayback(accessToken, { deviceId = '' } = {}) {
  return spotifyMutation('PUT', '/me/player/pause', accessToken, {
    params: deviceId ? { device_id: deviceId } : undefined,
  })
}

export async function skipToNextPlayback(accessToken, { deviceId = '' } = {}) {
  return spotifyMutation('POST', '/me/player/next', accessToken, {
    params: deviceId ? { device_id: deviceId } : undefined,
  })
}

export async function skipToPreviousPlayback(accessToken, { deviceId = '' } = {}) {
  return spotifyMutation('POST', '/me/player/previous', accessToken, {
    params: deviceId ? { device_id: deviceId } : undefined,
  })
}

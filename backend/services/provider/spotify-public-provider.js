import axios from 'axios'
import env from '../../config/env.js'
import { assert } from '../../utils/assert.js'
import { buildCacheKey, getOrSetCache } from '../cache.js'

const spotifyAccountsApi = axios.create({
  baseURL: 'https://accounts.spotify.com',
  timeout: 10000,
})

const spotifyApi = axios.create({
  baseURL: 'https://api.spotify.com/v1',
  timeout: 10000,
})

const PROVIDER_NAME = 'spotify'
const TOKEN_TTL_BUFFER_MS = 60_000

let cachedAppToken = null

function createSpotifyApiError(error, fallbackMessage) {
  const status = error.response?.status || 400
  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.error_description ||
    error.response?.data?.error ||
    error.message ||
    fallbackMessage

  const normalized = new Error(message)
  normalized.status = status
  normalized.details = error.response?.data

  return normalized
}

function createClientCredentials() {
  assert(env.spotifyClientId, 'SPOTIFY_CLIENT_ID is required', 500)
  assert(env.spotifyClientSecret, 'SPOTIFY_CLIENT_SECRET is required', 500)

  return Buffer.from(
    `${env.spotifyClientId}:${env.spotifyClientSecret}`,
  ).toString('base64')
}

async function getAppAccessToken() {
  if (
    cachedAppToken &&
    cachedAppToken.expiresAt - TOKEN_TTL_BUFFER_MS > Date.now()
  ) {
    return cachedAppToken.accessToken
  }

  try {
    const response = await spotifyAccountsApi.post(
      '/api/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
      }).toString(),
      {
        headers: {
          Authorization: `Basic ${createClientCredentials()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    )

    cachedAppToken = {
      accessToken: response.data.access_token,
      expiresAt: Date.now() + response.data.expires_in * 1000,
    }

    return cachedAppToken.accessToken
  } catch (error) {
    throw createSpotifyApiError(
      error,
      'Spotify client credentials token request failed',
    )
  }
}

async function spotifyPublicGet(path, params = {}, { ttlMs = 0 } = {}) {
  const cacheKey = buildCacheKey({
    provider: PROVIDER_NAME,
    path,
    params,
  })

  return getOrSetCache(cacheKey, ttlMs, async () => {
    const accessToken = await getAppAccessToken()

    try {
      const response = await spotifyApi.get(path, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params,
      })

      return response.data
    } catch (error) {
      throw createSpotifyApiError(error, `Spotify public request failed for ${path}`)
    }
  })
}

function normalizeImage(image) {
  if (!image?.url) {
    return null
  }

  return {
    url: image.url,
    width: image.width ?? null,
    height: image.height ?? null,
  }
}

function normalizeImages(images) {
  return Array.isArray(images)
    ? images.map(normalizeImage).filter(Boolean)
    : []
}

function createSourceId(entityType, id) {
  return `${PROVIDER_NAME}:${entityType}:${id}`
}

function normalizeArtistSummary(artist) {
  if (!artist?.id) {
    return null
  }

  return {
    provider: PROVIDER_NAME,
    entity_type: 'artist',
    source_type: PROVIDER_NAME,
    source_id: createSourceId('artist', artist.id),
    id: artist.id,
    name: artist.name || '',
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    followers: artist.followers?.total ?? null,
    popularity: artist.popularity ?? null,
    images: normalizeImages(artist.images),
    external_url: artist.external_urls?.spotify || null,
  }
}

function normalizeAlbumSummary(album) {
  if (!album?.id) {
    return null
  }

  return {
    provider: PROVIDER_NAME,
    entity_type: 'album',
    source_type: PROVIDER_NAME,
    source_id: createSourceId('album', album.id),
    id: album.id,
    name: album.name || '',
    album_type: album.album_type || '',
    release_date: album.release_date || null,
    total_tracks: album.total_tracks ?? null,
    images: normalizeImages(album.images),
    artists: Array.isArray(album.artists)
      ? album.artists.map(normalizeArtistSummary).filter(Boolean)
      : [],
    external_url: album.external_urls?.spotify || null,
  }
}

function normalizeTrackSummary(track) {
  if (!track?.id) {
    return null
  }

  return {
    provider: PROVIDER_NAME,
    entity_type: 'track',
    source_type: PROVIDER_NAME,
    source_id: createSourceId('track', track.id),
    id: track.id,
    name: track.name || '',
    duration_ms: track.duration_ms ?? null,
    explicit: Boolean(track.explicit),
    preview_url: track.preview_url || null,
    is_playable: Boolean(track.preview_url),
    track_number: track.track_number ?? null,
    disc_number: track.disc_number ?? null,
    popularity: track.popularity ?? null,
    artists: Array.isArray(track.artists)
      ? track.artists.map(normalizeArtistSummary).filter(Boolean)
      : [],
    album: track.album ? normalizeAlbumSummary(track.album) : null,
    external_url: track.external_urls?.spotify || null,
  }
}

function normalizePlaylistOwner(owner) {
  if (!owner?.id) {
    return null
  }

  return {
    id: owner.id,
    display_name: owner.display_name || owner.id,
    external_url: owner.external_urls?.spotify || null,
  }
}

function normalizePlaylistSummary(playlist) {
  if (!playlist?.id) {
    return null
  }

  return {
    provider: PROVIDER_NAME,
    entity_type: 'playlist',
    source_type: PROVIDER_NAME,
    source_id: createSourceId('playlist', playlist.id),
    id: playlist.id,
    name: playlist.name || '',
    description: playlist.description || '',
    public: playlist.public ?? null,
    collaborative: Boolean(playlist.collaborative),
    owner: normalizePlaylistOwner(playlist.owner),
    images: normalizeImages(playlist.images),
    total_tracks: playlist.tracks?.total ?? null,
    external_url: playlist.external_urls?.spotify || null,
  }
}

function normalizePlaylistTrackItems(items) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item, index) => {
      const normalizedTrack = normalizeTrackSummary(item?.track)

      if (!normalizedTrack) {
        return null
      }

      return {
        position: index,
        added_at: item?.added_at || null,
        added_by: item?.added_by?.id || null,
        track: normalizedTrack,
      }
    })
    .filter(Boolean)
}

function normalizeSearchResponse(data, params) {
  return {
    provider: PROVIDER_NAME,
    query: params.q,
    types: String(params.type || 'track,artist,playlist,album')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    limit: params.limit ?? null,
    offset: params.offset ?? null,
    results: {
      tracks: (data.tracks?.items || []).map(normalizeTrackSummary).filter(Boolean),
      artists: (data.artists?.items || [])
        .map(normalizeArtistSummary)
        .filter(Boolean),
      albums: (data.albums?.items || []).map(normalizeAlbumSummary).filter(Boolean),
      playlists: (data.playlists?.items || [])
        .map(normalizePlaylistSummary)
        .filter(Boolean),
    },
  }
}

function normalizeAlbumDetail(album) {
  return {
    ...normalizeAlbumSummary(album),
    copyrights: Array.isArray(album.copyrights) ? album.copyrights : [],
    genres: Array.isArray(album.genres) ? album.genres : [],
    label: album.label || null,
    popularity: album.popularity ?? null,
    tracks: Array.isArray(album.tracks?.items)
      ? album.tracks.items.map((track) =>
          normalizeTrackSummary({
            ...track,
            album,
          }),
        )
      : [],
  }
}

function normalizeArtistDetail(artist) {
  return normalizeArtistSummary(artist)
}

function normalizePlaylistDetail(playlist) {
  return {
    ...normalizePlaylistSummary(playlist),
    followers: playlist.followers?.total ?? null,
    tracks: normalizePlaylistTrackItems(playlist.tracks?.items || []),
  }
}

function normalizeRecommendations(data) {
  return {
    provider: PROVIDER_NAME,
    tracks: Array.isArray(data.tracks)
      ? data.tracks.map(normalizeTrackSummary).filter(Boolean)
      : [],
    seeds: Array.isArray(data.seeds) ? data.seeds : [],
  }
}

async function search(params) {
  const data = await spotifyPublicGet(
    '/search',
    {
      q: params.q,
      type: params.type || 'track,artist,playlist,album',
      limit: params.limit,
      offset: params.offset,
      market: params.market,
      include_external: params.include_external,
    },
    { ttlMs: 15_000 },
  )

  return normalizeSearchResponse(data, params)
}

async function getTrack(id, options = {}) {
  const data = await spotifyPublicGet(
    `/tracks/${id}`,
    {
      market: options.market,
    },
    { ttlMs: 5 * 60_000 },
  )

  return normalizeTrackSummary(data)
}

async function getAlbum(id, options = {}) {
  const data = await spotifyPublicGet(
    `/albums/${id}`,
    {
      market: options.market,
    },
    { ttlMs: 5 * 60_000 },
  )

  return normalizeAlbumDetail(data)
}

async function getArtist(id) {
  const data = await spotifyPublicGet(`/artists/${id}`, {}, { ttlMs: 5 * 60_000 })
  return normalizeArtistDetail(data)
}

async function getPlaylist(id, options = {}) {
  const data = await spotifyPublicGet(
    `/playlists/${id}`,
    {
      market: options.market,
    },
    { ttlMs: 30_000 },
  )

  return normalizePlaylistDetail(data)
}

async function getRecommendations(params) {
  const data = await spotifyPublicGet(
    '/recommendations',
    {
      seed_artists: params.seed_artists,
      seed_tracks: params.seed_tracks,
      seed_genres: params.seed_genres,
      limit: params.limit,
      market: params.market,
    },
    { ttlMs: 30_000 },
  )

  return normalizeRecommendations(data)
}

async function getPreviewAudio(id, options = {}) {
  const track = await getTrack(id, options)

  return {
    provider: PROVIDER_NAME,
    source_type: PROVIDER_NAME,
    source_id: createSourceId('track', id),
    preview_url: track.preview_url,
    is_playable: track.is_playable,
  }
}

export const spotifyPublicProvider = {
  search,
  getTrack,
  getAlbum,
  getArtist,
  getPlaylist,
  getRecommendations,
  getPreviewAudio,
}

export default spotifyPublicProvider

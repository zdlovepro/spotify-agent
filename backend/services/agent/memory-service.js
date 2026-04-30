import { listFavorites, listPlaylists, getPlaylist } from '../library/library-service.js'
import { getUserTopItems, parseInteger } from '../spotify-api.js'
import { listStoredFeedback } from './agent-feedback-service.js'
import { listStoredRecommendationRuns } from './agent-recommendation-service.js'

function createEmptyMemoryProfile() {
  return {
    topTracks: [],
    topArtists: [],
    recentRecommendations: [],
    recentFeedback: [],
  }
}

function extractSpotifyEntityId(sourceId, entityType) {
  if (typeof sourceId !== 'string' || !sourceId) {
    return ''
  }

  const parts = sourceId.split(':')

  if (parts.length >= 3 && parts[0] === 'spotify' && parts[1] === entityType) {
    return parts.slice(2).join(':')
  }

  return ''
}

function uniqueBy(items, selector) {
  const seen = new Set()

  return items.filter((item) => {
    const key = selector(item)

    if (!key || seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function mapLibraryTrack(track = {}) {
  const rawArtists = Array.isArray(track.artists) ? track.artists : []
  const artists = rawArtists
    .map((artist) => {
      if (typeof artist === 'string') {
        return artist.trim()
      }

      if (artist?.name) {
        return String(artist.name).trim()
      }

      return ''
    })
    .filter(Boolean)
  const sourceType =
    typeof track.source_type === 'string'
      ? track.source_type
      : typeof track.sourceType === 'string'
        ? track.sourceType
        : 'unknown'
  const sourceId =
    typeof track.source_id === 'string'
      ? track.source_id
      : typeof track.sourceId === 'string'
        ? track.sourceId
        : ''
  const id =
    typeof track.id === 'string' && track.id
      ? track.id
      : extractSpotifyEntityId(sourceId, 'track') || sourceId

  return {
    id,
    sourceType,
    sourceId,
    name: track.title || track.name || 'Unknown track',
    artists,
    popularity: null,
  }
}

function mapSpotifyTrack(track = {}) {
  return {
    id: track.id,
    sourceType: 'spotify',
    sourceId: `spotify:track:${track.id}`,
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name),
    popularity: track.popularity ?? null,
  }
}

function mapSpotifyArtist(artist = {}) {
  return {
    id: artist.id,
    sourceType: 'spotify',
    sourceId: `spotify:artist:${artist.id}`,
    name: artist.name,
    genres: Array.isArray(artist.genres) ? artist.genres : [],
    popularity: artist.popularity ?? null,
  }
}

function deriveArtistsFromTracks(tracks, limit) {
  const scoreMap = new Map()

  for (const track of tracks) {
    for (const artistName of track.artists || []) {
      const normalizedName = String(artistName || '').trim()

      if (!normalizedName) {
        continue
      }

      const existing = scoreMap.get(normalizedName) || 0
      scoreMap.set(normalizedName, existing + 1)
    }
  }

  return [...scoreMap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name, count]) => ({
      id: `local:artist:${name.toLowerCase()}`,
      sourceType: 'local',
      sourceId: `local:artist:${name.toLowerCase()}`,
      name,
      genres: [],
      popularity: count,
    }))
}

function collectPlaylistTracks(localUserId, limit) {
  const playlists = listPlaylists(localUserId).slice(0, 3)
  const collectedTracks = []

  for (const playlist of playlists) {
    const detailedPlaylist = getPlaylist(localUserId, playlist.id)

    for (const item of detailedPlaylist?.items || []) {
      collectedTracks.push(mapLibraryTrack(item))

      if (collectedTracks.length >= limit * 2) {
        return collectedTracks
      }
    }
  }

  return collectedTracks
}

export async function buildUserTasteProfile({
  mode,
  localUserId,
  providerLinks = {},
  recommendationLimit = 5,
  topLimit = 5,
  feedbackLimit = 5,
}) {
  if (!localUserId) {
    return createEmptyMemoryProfile()
  }

  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const safeHistoryLimit = parseInteger(recommendationLimit, 5, {
    min: 1,
    max: 10,
  })
  const safeFeedbackLimit = parseInteger(feedbackLimit, 5, {
    min: 1,
    max: 10,
  })

  const favoriteTracks = listFavorites(localUserId, 'track')
    .map((favorite) => mapLibraryTrack(favorite))
    .filter((track) => track.id)
  const playlistTracks = collectPlaylistTracks(localUserId, safeTopLimit)
  const localTracks = uniqueBy(
    [...favoriteTracks, ...playlistTracks],
    (track) => track.sourceId || track.id,
  )
  const recentRecommendations = listStoredRecommendationRuns(
    localUserId,
    safeHistoryLimit,
  ).map((entry) => ({
    id: entry.id,
    title: entry.title,
    prompt: entry.prompt,
    seeds: entry.seeds,
    createdAt: entry.createdAt,
  }))
  const recentFeedback = listStoredFeedback(localUserId, safeFeedbackLimit).map(
    (entry) => ({
      id: entry.id,
      feedback: entry.feedback,
      recommendationId: entry.recommendationId,
      messageId: entry.messageId,
      note: entry.note,
      createdAt: entry.createdAt,
    }),
  )

  let topTracks = localTracks.slice(0, safeTopLimit)
  let topArtists = deriveArtistsFromTracks(localTracks, safeTopLimit)

  const spotifyProviderLink = providerLinks.spotify

  if (
    mode === 'spotify_enhanced' &&
    spotifyProviderLink?.accessToken
  ) {
    const [topTracksResult, topArtistsResult] = await Promise.allSettled([
      getUserTopItems(spotifyProviderLink.accessToken, 'tracks', {
        time_range: 'medium_term',
        limit: safeTopLimit,
        offset: 0,
      }),
      getUserTopItems(spotifyProviderLink.accessToken, 'artists', {
        time_range: 'medium_term',
        limit: safeTopLimit,
        offset: 0,
      }),
    ])

    if (topTracksResult.status === 'fulfilled') {
      const spotifyTracks = (topTracksResult.value.items || []).map(mapSpotifyTrack)
      topTracks = uniqueBy(
        [...spotifyTracks, ...topTracks],
        (track) => track.sourceId || track.id,
      ).slice(0, safeTopLimit)
    }

    if (topArtistsResult.status === 'fulfilled') {
      const spotifyArtists = (topArtistsResult.value.items || []).map(
        mapSpotifyArtist,
      )
      topArtists = uniqueBy(
        [...spotifyArtists, ...topArtists],
        (artist) => artist.sourceId || artist.id,
      ).slice(0, safeTopLimit)
    }
  }

  return {
    topTracks,
    topArtists,
    recentRecommendations,
    recentFeedback,
  }
}

export default {
  buildUserTasteProfile,
}

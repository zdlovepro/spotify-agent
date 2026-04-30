import { listFavorites, listPlaylists, getPlaylist } from '../library/library-service.js'
import { getUserTopItems, parseInteger } from '../spotify-api.js'
import { listStoredFeedback } from './agent-feedback-service.js'
import { listStoredRecommendationRuns } from './agent-recommendation-service.js'

export function createEmptyMemoryProfile() {
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

function normalizeArtistNames(artists) {
  return (Array.isArray(artists) ? artists : [])
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
}

export function mapLibraryTrack(track = {}) {
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
    artists: normalizeArtistNames(track.artists),
    popularity: null,
  }
}

export function mapSpotifyTrack(track = {}) {
  return {
    id: track.id,
    sourceType: 'spotify',
    sourceId: `spotify:track:${track.id}`,
    name: track.name,
    artists: normalizeArtistNames(track.artists),
    popularity: track.popularity ?? null,
  }
}

export function mapSpotifyArtist(artist = {}) {
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

function normalizeRecommendationHistoryEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    prompt: entry.prompt,
    seeds: entry.seeds,
    createdAt: entry.createdAt,
  }))
}

function normalizeFeedbackEntries(entries = []) {
  return entries.map((entry) => ({
    id: entry.id,
    feedback: entry.feedback,
    recommendationId: entry.recommendationId,
    messageId: entry.messageId,
    note: entry.note,
    createdAt: entry.createdAt,
  }))
}

export function buildLocalTasteProfile({
  localUserId,
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
  const topTracks = uniqueBy(
    [...favoriteTracks, ...playlistTracks],
    (track) => track.sourceId || track.id,
  ).slice(0, safeTopLimit)
  const topArtists = deriveArtistsFromTracks(topTracks, safeTopLimit)
  const recentRecommendations = normalizeRecommendationHistoryEntries(
    listStoredRecommendationRuns(localUserId, safeHistoryLimit),
  )
  const recentFeedback = normalizeFeedbackEntries(
    listStoredFeedback(localUserId, safeFeedbackLimit),
  )

  return {
    topTracks,
    topArtists,
    recentRecommendations,
    recentFeedback,
  }
}

export function mergeSpotifyEnhancement(
  memoryProfile,
  {
    spotifyTopTracks = [],
    spotifyTopArtists = [],
    topLimit = 5,
  } = {},
) {
  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })

  return {
    ...memoryProfile,
    topTracks: uniqueBy(
      [...spotifyTopTracks, ...(memoryProfile.topTracks || [])],
      (track) => track.sourceId || track.id,
    ).slice(0, safeTopLimit),
    topArtists: uniqueBy(
      [...spotifyTopArtists, ...(memoryProfile.topArtists || [])],
      (artist) => artist.sourceId || artist.id,
    ).slice(0, safeTopLimit),
  }
}

export async function buildUserTasteProfile({
  mode,
  localUserId,
  providerLinks = {},
  recommendationLimit = 5,
  topLimit = 5,
  feedbackLimit = 5,
}) {
  const localProfile = buildLocalTasteProfile({
    localUserId,
    recommendationLimit,
    topLimit,
    feedbackLimit,
  })

  if (!localUserId || mode !== 'spotify_enhanced' || !providerLinks.spotify?.accessToken) {
    return localProfile
  }

  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const [topTracksResult, topArtistsResult] = await Promise.allSettled([
    getUserTopItems(providerLinks.spotify.accessToken, 'tracks', {
      time_range: 'medium_term',
      limit: safeTopLimit,
      offset: 0,
    }),
    getUserTopItems(providerLinks.spotify.accessToken, 'artists', {
      time_range: 'medium_term',
      limit: safeTopLimit,
      offset: 0,
    }),
  ])

  return mergeSpotifyEnhancement(localProfile, {
    spotifyTopTracks:
      topTracksResult.status === 'fulfilled'
        ? (topTracksResult.value.items || []).map(mapSpotifyTrack)
        : [],
    spotifyTopArtists:
      topArtistsResult.status === 'fulfilled'
        ? (topArtistsResult.value.items || []).map(mapSpotifyArtist)
        : [],
    topLimit: safeTopLimit,
  })
}

export default {
  createEmptyMemoryProfile,
  buildLocalTasteProfile,
  mergeSpotifyEnhancement,
  buildUserTasteProfile,
  mapLibraryTrack,
  mapSpotifyTrack,
  mapSpotifyArtist,
}

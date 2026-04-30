import db from '../../db/index.js'
import { getUserTopItems, parseInteger } from '../spotify-api.js'

const DEFAULT_PUBLIC_GENRES = ['pop']
const DEFAULT_PUBLIC_QUERY = 'popular music'

function nowIso() {
  return new Date().toISOString()
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback
  }

  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
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

function normalizeArtistNames(input) {
  if (typeof input === 'string') {
    return input
      .split(/,|、|\//)
      .map((artist) => artist.trim())
      .filter(Boolean)
  }

  return (Array.isArray(input) ? input : [])
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

function buildTrackKey(track) {
  return track.sourceId || track.id || ''
}

function createEmptySignalSummary() {
  return {
    favoriteCount: 0,
    playlistItemCount: 0,
    listeningEventCount: 0,
    recommendationItemCount: 0,
    feedbackCount: 0,
  }
}

export function createEmptyMemoryProfile(overrides = {}) {
  return {
    mode: overrides.mode || 'guest',
    topTracks: [],
    topArtists: [],
    recentRecommendations: [],
    recentFeedback: [],
    defaultGenres: [...DEFAULT_PUBLIC_GENRES],
    publicSeeds: {
      genres: [...DEFAULT_PUBLIC_GENRES],
      query: DEFAULT_PUBLIC_QUERY,
    },
    avoidSourceIds: [],
    likedSourceIds: [],
    signalSummary: createEmptySignalSummary(),
    builtAt: nowIso(),
  }
}

function mapSqlTrack({
  sourceType,
  sourceId,
  title,
  artists,
  album,
  imageUrl,
  previewUrl,
  durationMs,
}) {
  const spotifyTrackId = extractSpotifyEntityId(sourceId, 'track')

  return {
    id: spotifyTrackId || sourceId,
    sourceType: sourceType || 'unknown',
    sourceId: sourceId || '',
    name: title || 'Unknown track',
    artists: normalizeArtistNames(artists),
    album:
      typeof album === 'string'
        ? album
        : typeof album?.name === 'string'
          ? album.name
          : '',
    image: imageUrl || '',
    previewUrl: previewUrl || '',
    durationMs: durationMs ?? null,
    popularity: null,
  }
}

function mapSpotifyTrack(track = {}) {
  return {
    id: track.id,
    sourceType: 'spotify',
    sourceId: `spotify:track:${track.id}`,
    name: track.name,
    artists: normalizeArtistNames(track.artists),
    album: track.album?.name || '',
    image: track.album?.images?.[0]?.url || '',
    previewUrl: track.preview_url || '',
    durationMs: track.duration_ms ?? null,
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

function createTrackAccumulator(track) {
  return {
    ...track,
    score: 0,
    lastSeenAt: '',
    reasons: [],
  }
}

function scoreTrack(trackMap, track, weight, reason, createdAt = '') {
  const key = buildTrackKey(track)

  if (!key) {
    return
  }

  const current = trackMap.get(key) || createTrackAccumulator(track)
  current.score += weight

  if (!current.name || current.name === 'Unknown track') {
    current.name = track.name
  }

  if ((!current.artists || current.artists.length === 0) && track.artists?.length) {
    current.artists = track.artists
  }

  if (!current.album && track.album) {
    current.album = track.album
  }

  if (!current.image && track.image) {
    current.image = track.image
  }

  if (!current.previewUrl && track.previewUrl) {
    current.previewUrl = track.previewUrl
  }

  if (!current.durationMs && track.durationMs) {
    current.durationMs = track.durationMs
  }

  if (createdAt && (!current.lastSeenAt || createdAt > current.lastSeenAt)) {
    current.lastSeenAt = createdAt
  }

  current.reasons.push(reason)
  trackMap.set(key, current)
}

function buildTopArtistsFromTracks(trackMap, topLimit) {
  const artistScoreMap = new Map()

  for (const track of trackMap.values()) {
    for (const artistName of track.artists || []) {
      const normalizedName = String(artistName || '').trim()

      if (!normalizedName) {
        continue
      }

      const key = normalizedName.toLowerCase()
      const current = artistScoreMap.get(key) || {
        id: `local:artist:${key}`,
        sourceType: 'local',
        sourceId: `local:artist:${key}`,
        name: normalizedName,
        genres: [],
        popularity: 0,
      }

      current.popularity += Math.max(track.score, 0)
      artistScoreMap.set(key, current)
    }
  }

  return [...artistScoreMap.values()]
    .sort((left, right) => right.popularity - left.popularity)
    .slice(0, topLimit)
}

function extractTrackFromFavoriteRow(row) {
  return mapSqlTrack({
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title || 'Unknown track',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, {}),
    imageUrl: row.image_url || '',
    previewUrl: row.preview_url || '',
    durationMs: row.duration_ms ?? null,
  })
}

function extractTrackFromPlaylistItemRow(row) {
  return mapSqlTrack({
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title || 'Unknown track',
    artists: parseJson(row.artists_json, []),
    album: parseJson(row.album_json, {}),
    imageUrl: row.image_url || '',
    previewUrl: row.preview_url || '',
    durationMs: row.duration_ms ?? null,
  })
}

function extractTrackFromListeningEventRow(row) {
  const metadata = parseJson(row.metadata_json, {})
  const trackPayload =
    metadata.track && typeof metadata.track === 'object' ? metadata.track : metadata

  return mapSqlTrack({
    sourceType: row.source_type,
    sourceId: row.source_id,
    title:
      trackPayload.trackName ||
      trackPayload.title ||
      trackPayload.name ||
      row.source_id,
    artists:
      trackPayload.artists ||
      trackPayload.trackArtists ||
      trackPayload.artistName ||
      trackPayload.trackArtist ||
      [],
    album:
      trackPayload.album ||
      trackPayload.albumName ||
      {},
    imageUrl:
      trackPayload.image ||
      trackPayload.image_url ||
      trackPayload.coverImageUrl ||
      '',
    previewUrl:
      trackPayload.previewUrl ||
      trackPayload.preview_url ||
      '',
    durationMs:
      row.duration_ms ??
      trackPayload.durationMs ??
      trackPayload.duration_ms ??
      null,
  })
}

function extractTrackFromRecommendationItemRow(row) {
  const metadata = parseJson(row.metadata_json, {})

  return mapSqlTrack({
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title || metadata.name || 'Unknown track',
    artists: metadata.artists || row.artist_name || [],
    album: metadata.album || row.album_name || {},
    imageUrl: metadata.image || '',
    previewUrl: row.preview_url || metadata.previewUrl || '',
    durationMs: metadata.durationMs ?? null,
  })
}

function getListeningWeight(row) {
  const eventType = String(row.event_type || '').toLowerCase()
  const ratio =
    row.duration_ms && row.duration_ms > 0
      ? Math.min(1, Number(row.position_ms || 0) / Number(row.duration_ms))
      : 0

  switch (eventType) {
    case 'complete':
      return 6
    case 'play':
    case 'resume':
      return ratio >= 0.7 ? 4 : 2
    case 'seek':
      return 1
    case 'pause':
      return 0.5
    case 'skip':
    case 'stop':
      return -1
    default:
      return ratio >= 0.7 ? 3 : 1
  }
}

function normalizeRecommendationSummaryRows(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    title: row.title || 'Untitled Recommendation',
    prompt: row.prompt || '',
    seeds: parseJson(row.seed_summary_json, {}),
    createdAt: row.created_at,
  }))
}

function normalizeFeedbackRows(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    feedback: row.event_type,
    recommendationId: row.recommendation_run_id || '',
    messageId: row.message_id || '',
    note: row.note || '',
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  }))
}

function loadFavoriteRows(localUserId) {
  return db
    .prepare(
      `
        SELECT *
        FROM library_favorites
        WHERE owner_user_id = ?
          AND favorite_type = 'track'
        ORDER BY created_at DESC
        LIMIT 100
      `,
    )
    .all(localUserId)
}

function loadPlaylistItemRows(localUserId) {
  return db
    .prepare(
      `
        SELECT lpi.*, lp.updated_at AS playlist_updated_at
        FROM library_playlist_items lpi
        INNER JOIN library_playlists lp ON lp.id = lpi.playlist_id
        WHERE lp.owner_user_id = ?
        ORDER BY lp.updated_at DESC, lpi.position ASC, lpi.created_at DESC
        LIMIT 200
      `,
    )
    .all(localUserId)
}

function loadListeningEventRows(localUserId) {
  return db
    .prepare(
      `
        SELECT *
        FROM listening_events
        WHERE owner_user_id = ?
        ORDER BY created_at DESC
        LIMIT 300
      `,
    )
    .all(localUserId)
}

function loadRecommendationSummaryRows(localUserId, limit) {
  return db
    .prepare(
      `
        SELECT *
        FROM recommendation_runs
        WHERE owner_user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(localUserId, limit)
}

function loadRecommendationItemRows(localUserId) {
  return db
    .prepare(
      `
        SELECT ri.*, rr.created_at AS recommendation_created_at
        FROM recommendation_items ri
        INNER JOIN recommendation_runs rr ON rr.id = ri.recommendation_run_id
        WHERE rr.owner_user_id = ?
        ORDER BY rr.created_at DESC, ri.position ASC
        LIMIT 200
      `,
    )
    .all(localUserId)
}

function loadFeedbackRows(localUserId, limit) {
  return db
    .prepare(
      `
        SELECT *
        FROM feedback_events
        WHERE owner_user_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
    )
    .all(localUserId, limit)
}

function buildFeedbackWeightMap(feedbackRows) {
  const byRecommendation = new Map()
  const likedSourceIds = new Set()
  const avoidSourceIds = new Set()

  for (const row of feedbackRows) {
    if (!row.recommendation_run_id) {
      continue
    }

    const weight = row.event_type === 'like' ? 4 : row.event_type === 'dislike' ? -5 : 0
    if (!weight) {
      continue
    }

    byRecommendation.set(row.recommendation_run_id, weight)
  }

  return {
    byRecommendation,
    likedSourceIds,
    avoidSourceIds,
  }
}

function finalizeTrackRanking(trackMap, topLimit, avoidSourceIds) {
  return [...trackMap.values()]
    .filter((track) => {
      const key = track.sourceId || track.id

      if (!key) {
        return false
      }

      if (avoidSourceIds.has(key) && track.score <= 0) {
        return false
      }

      return track.score > 0
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      return String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || ''))
    })
    .slice(0, topLimit)
    .map((track) => ({
      id: track.id,
      sourceType: track.sourceType,
      sourceId: track.sourceId,
      name: track.name,
      artists: track.artists,
      album: track.album,
      image: track.image,
      previewUrl: track.previewUrl,
      durationMs: track.durationMs,
      popularity: track.score,
    }))
}

export function buildLocalTasteProfile(
  localUserId,
  {
    recommendationLimit = 5,
    topLimit = 5,
    feedbackLimit = 5,
  } = {},
) {
  if (!localUserId) {
    return createEmptyMemoryProfile({
      mode: 'guest',
    })
  }

  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const safeHistoryLimit = parseInteger(recommendationLimit, 5, {
    min: 1,
    max: 10,
  })
  const safeFeedbackLimit = parseInteger(feedbackLimit, 5, {
    min: 1,
    max: 20,
  })
  const favoriteRows = loadFavoriteRows(localUserId)
  const playlistItemRows = loadPlaylistItemRows(localUserId)
  const listeningEventRows = loadListeningEventRows(localUserId)
  const recommendationSummaryRows = loadRecommendationSummaryRows(
    localUserId,
    safeHistoryLimit,
  )
  const recommendationItemRows = loadRecommendationItemRows(localUserId)
  const feedbackRows = loadFeedbackRows(localUserId, safeFeedbackLimit)
  const trackMap = new Map()
  const feedbackWeights = buildFeedbackWeightMap(feedbackRows)
  const likedSourceIds = new Set()
  const avoidSourceIds = new Set()

  for (const row of favoriteRows) {
    const track = extractTrackFromFavoriteRow(row)
    scoreTrack(trackMap, track, 8, 'favorite', row.created_at)
    likedSourceIds.add(track.sourceId || track.id)
  }

  for (const row of playlistItemRows) {
    const track = extractTrackFromPlaylistItemRow(row)
    scoreTrack(trackMap, track, 3, 'playlist_item', row.created_at)
  }

  for (const row of listeningEventRows) {
    const track = extractTrackFromListeningEventRow(row)
    scoreTrack(
      trackMap,
      track,
      getListeningWeight(row),
      `listening:${row.event_type || 'play'}`,
      row.created_at,
    )
  }

  for (const row of recommendationItemRows) {
    const track = extractTrackFromRecommendationItemRow(row)
    const feedbackWeight =
      feedbackWeights.byRecommendation.get(row.recommendation_run_id) || 0

    if (feedbackWeight > 0) {
      likedSourceIds.add(track.sourceId || track.id)
    }

    if (feedbackWeight < 0) {
      avoidSourceIds.add(track.sourceId || track.id)
    }

    scoreTrack(
      trackMap,
      track,
      1 + feedbackWeight,
      `recommendation_item:${row.recommendation_run_id}`,
      row.recommendation_created_at,
    )
  }

  const topTracks = finalizeTrackRanking(trackMap, safeTopLimit, avoidSourceIds)
  const topArtists = buildTopArtistsFromTracks(trackMap, safeTopLimit)
  const recentRecommendations = normalizeRecommendationSummaryRows(
    recommendationSummaryRows,
  )
  const recentFeedback = normalizeFeedbackRows(feedbackRows)

  return {
    mode: 'local_user',
    topTracks,
    topArtists,
    recentRecommendations,
    recentFeedback,
    defaultGenres: [...DEFAULT_PUBLIC_GENRES],
    publicSeeds: {
      genres: [...DEFAULT_PUBLIC_GENRES],
      query:
        topArtists[0]?.name ||
        topTracks[0]?.name ||
        DEFAULT_PUBLIC_QUERY,
    },
    avoidSourceIds: [...avoidSourceIds],
    likedSourceIds: uniqueBy(
      [...likedSourceIds].map((sourceId) => ({ sourceId })),
      (item) => item.sourceId,
    ).map((item) => item.sourceId),
    signalSummary: {
      favoriteCount: favoriteRows.length,
      playlistItemCount: playlistItemRows.length,
      listeningEventCount: listeningEventRows.length,
      recommendationItemCount: recommendationItemRows.length,
      feedbackCount: feedbackRows.length,
    },
    builtAt: nowIso(),
  }
}

export async function buildSpotifyEnhancedProfile(
  providerLink,
  {
    topLimit = 5,
    topTracksResponse = null,
    topArtistsResponse = null,
  } = {},
) {
  if (!providerLink?.accessToken) {
    return {
      provider: 'spotify',
      topTracks: [],
      topArtists: [],
    }
  }

  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const [tracksResult, artistsResult] = await Promise.all([
    topTracksResponse
      ? Promise.resolve(topTracksResponse)
      : getUserTopItems(providerLink.accessToken, 'tracks', {
          time_range: 'medium_term',
          limit: safeTopLimit,
          offset: 0,
        }),
    topArtistsResponse
      ? Promise.resolve(topArtistsResponse)
      : getUserTopItems(providerLink.accessToken, 'artists', {
          time_range: 'medium_term',
          limit: safeTopLimit,
          offset: 0,
        }),
  ])

  return {
    provider: 'spotify',
    topTracks: (tracksResult.items || []).map(mapSpotifyTrack),
    topArtists: (artistsResult.items || []).map(mapSpotifyArtist),
  }
}

export function mergeSpotifyEnhancement(
  localProfile,
  spotifyProfile,
  {
    topLimit = 5,
  } = {},
) {
  const safeTopLimit = parseInteger(topLimit, 5, { min: 1, max: 10 })
  const baseProfile = localProfile || createEmptyMemoryProfile()
  const enhancement = spotifyProfile || {
    topTracks: [],
    topArtists: [],
  }

  return {
    ...baseProfile,
    mode: 'spotify_enhanced',
    topTracks: uniqueBy(
      [...(baseProfile.topTracks || []), ...(enhancement.topTracks || [])],
      (track) => track.sourceId || track.id,
    ).slice(0, safeTopLimit),
    topArtists: uniqueBy(
      [...(baseProfile.topArtists || []), ...(enhancement.topArtists || [])],
      (artist) => artist.sourceId || artist.id,
    ).slice(0, safeTopLimit),
    spotifyEnhanced: {
      provider: enhancement.provider || 'spotify',
      topTrackCount: enhancement.topTracks?.length || 0,
      topArtistCount: enhancement.topArtists?.length || 0,
    },
    builtAt: nowIso(),
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
  if (mode === 'guest' || !localUserId) {
    return createEmptyMemoryProfile({
      mode: 'guest',
    })
  }

  const localProfile = buildLocalTasteProfile(localUserId, {
    recommendationLimit,
    topLimit,
    feedbackLimit,
  })

  if (mode !== 'spotify_enhanced' || !providerLinks.spotify?.accessToken) {
    return {
      ...localProfile,
      mode: 'local_user',
    }
  }

  const spotifyProfile = await buildSpotifyEnhancedProfile(providerLinks.spotify, {
    topLimit,
  })

  return mergeSpotifyEnhancement(localProfile, spotifyProfile, {
    topLimit,
  })
}

export default {
  createEmptyMemoryProfile,
  buildLocalTasteProfile,
  buildSpotifyEnhancedProfile,
  mergeSpotifyEnhancement,
  buildUserTasteProfile,
}

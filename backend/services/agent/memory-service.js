import db from '../../db/index.js'
import { getUserTopItems, parseInteger } from '../spotify-api.js'

const DEFAULT_PUBLIC_GENRES = ['pop']
const DEFAULT_PUBLIC_QUERY = 'popular music'
const DEFAULT_AGENT_MEMORY_SUMMARY = 'No long-term AgentMusic memory is available yet.'
const AGENT_MEMORY_SCENE_KEYWORDS = [
  { keyword: 'coding', patterns: [/写代码|编程|coding|programming|developer|code\b/i] },
  { keyword: 'study', patterns: [/学习|专注|study|focus|concentrat/i] },
  { keyword: 'workout', patterns: [/健身|运动|跑步|workout|gym|exercise|training/i] },
  { keyword: 'relax', patterns: [/放松|chill|relax|calm|mellow/i] },
  { keyword: 'sleep', patterns: [/睡前|睡觉|助眠|sleep|bedtime/i] },
  { keyword: 'night', patterns: [/夜晚|晚上|深夜|night|evening/i] },
  { keyword: 'morning', patterns: [/早晨|清晨|morning/i] },
  { keyword: 'commute', patterns: [/通勤|地铁|开车|commute|drive|driving/i] },
  { keyword: 'party', patterns: [/派对|聚会|party|dance/i] },
  { keyword: 'sad', patterns: [/伤感|难过|emo|sad/i] },
  { keyword: 'happy', patterns: [/开心|快乐|happy|feel good/i] },
  { keyword: 'instrumental', patterns: [/纯音乐|instrumental|piano|钢琴/i] },
  { keyword: 'jazz', patterns: [/爵士|jazz/i] },
  { keyword: 'classical', patterns: [/古典|classical/i] },
  { keyword: 'electronic', patterns: [/电子|electronic|edm/i] },
  { keyword: 'cantopop', patterns: [/粤语|港乐|cantopop/i] },
  { keyword: 'j-pop', patterns: [/日语|j-pop|jpop|anime/i] },
  { keyword: 'k-pop', patterns: [/韩语|k-pop|kpop/i] },
]

function nowIso() {
  return new Date().toISOString()
}

function truncateText(value, maxLength = 120) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
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

function formatTrackLabel(track = {}, maxLength = 80) {
  const name = truncateText(track.name || track.title || 'Unknown track', 48)
  const artists = normalizeArtistNames(track.artists).slice(0, 2).join(', ')
  const label = artists ? `${name} - ${artists}` : name

  return truncateText(label, maxLength)
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

function loadAudioAssetCount(localUserId) {
  return (
    db
      .prepare(
        `
          SELECT COUNT(1) AS count
          FROM audio_assets
          WHERE owner_user_id = ?
             OR user_id = ?
        `,
      )
      .get(localUserId, localUserId)?.count || 0
  )
}

function loadRecentPlaylistRows(localUserId, limit = 5) {
  return db
    .prepare(
      `
        SELECT
          lp.*,
          (
            SELECT COUNT(1)
            FROM library_playlist_items lpi
            WHERE lpi.playlist_id = lp.id
          ) AS item_count
        FROM library_playlists lp
        WHERE lp.owner_user_id = ?
        ORDER BY lp.created_at DESC, lp.updated_at DESC
        LIMIT ?
      `,
    )
    .all(localUserId, limit)
}

function loadRecentUserMessageRows(localUserId, limit = 12) {
  return db
    .prepare(
      `
        SELECT
          m.content,
          m.intent,
          m.created_at,
          c.id AS conversation_id,
          c.title AS conversation_title
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.owner_user_id = ?
          AND m.role = 'user'
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT ?
      `,
    )
    .all(localUserId, limit)
}

function loadRecentDislikedRecommendationRows(localUserId, limit = 4) {
  return db
    .prepare(
      `
        SELECT
          fe.id,
          fe.note,
          fe.created_at,
          fe.recommendation_run_id,
          rr.title AS recommendation_title,
          rr.prompt AS recommendation_prompt
        FROM feedback_events fe
        LEFT JOIN recommendation_runs rr ON rr.id = fe.recommendation_run_id
        WHERE fe.owner_user_id = ?
          AND fe.event_type = 'dislike'
        ORDER BY fe.created_at DESC, fe.id DESC
        LIMIT ?
      `,
    )
    .all(localUserId, limit)
}

function loadRecommendationItemHintRows(recommendationRunIds = []) {
  const safeIds = Array.isArray(recommendationRunIds)
    ? recommendationRunIds.filter((id) => typeof id === 'string' && id)
    : []

  if (!safeIds.length) {
    return []
  }

  const placeholders = safeIds.map(() => '?').join(', ')

  return db
    .prepare(
      `
        SELECT
          recommendation_run_id,
          title,
          artist_name,
          position
        FROM recommendation_items
        WHERE recommendation_run_id IN (${placeholders})
          AND position < 3
        ORDER BY recommendation_run_id ASC, position ASC
      `,
    )
    .all(...safeIds)
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

function createEmptyAgentMemoryContext(overrides = {}) {
  return {
    mode: overrides.mode || 'guest',
    hasLongTermMemory: Boolean(overrides.hasLongTermMemory),
    frequentLocalAudio: overrides.frequentLocalAudio || [],
    frequentSpotifyTracks: overrides.frequentSpotifyTracks || [],
    topFavoriteArtists: overrides.topFavoriteArtists || [],
    commonContextKeywords: overrides.commonContextKeywords || [],
    recentDislikedRecommendations: overrides.recentDislikedRecommendations || [],
    recentPlaylists: overrides.recentPlaylists || [],
    recentConversationHighlights: overrides.recentConversationHighlights || [],
    summaryText:
      typeof overrides.summaryText === 'string' && overrides.summaryText.trim()
        ? overrides.summaryText.trim()
        : DEFAULT_AGENT_MEMORY_SUMMARY,
    signalSummary: {
      audioAssetCount: 0,
      playlistCount: 0,
      spotifyImportedPlaylistCount: 0,
      favoriteCount: 0,
      listeningEventCount: 0,
      recommendationCount: 0,
      feedbackCount: 0,
      recentConversationCount: 0,
      ...(overrides.signalSummary || {}),
    },
    builtAt: nowIso(),
  }
}

function buildFrequentListeningTracks(
  listeningEventRows = [],
  { sourceMatcher = () => true, limit = 4 } = {},
) {
  const trackMap = new Map()

  for (const row of listeningEventRows) {
    if (!sourceMatcher(row)) {
      continue
    }

    const track = extractTrackFromListeningEventRow(row)
    const key = buildTrackKey(track)

    if (!key) {
      continue
    }

    const current = trackMap.get(key) || {
      ...track,
      score: 0,
      playCount: 0,
      lastSeenAt: '',
    }

    current.score += getListeningWeight(row)

    if (['play', 'resume', 'complete'].includes(String(row.event_type || '').toLowerCase())) {
      current.playCount += 1
    }

    if (row.created_at && (!current.lastSeenAt || row.created_at > current.lastSeenAt)) {
      current.lastSeenAt = row.created_at
    }

    trackMap.set(key, current)
  }

  return [...trackMap.values()]
    .filter((track) => track.score > 0 || track.playCount > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }

      if (right.playCount !== left.playCount) {
        return right.playCount - left.playCount
      }

      return String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || ''))
    })
    .slice(0, limit)
    .map((track) => ({
      name: track.name,
      artists: track.artists || [],
      sourceId: track.sourceId || '',
      playCount: track.playCount,
      lastSeenAt: track.lastSeenAt || '',
      playMode:
        track.sourceType === 'local_audio'
          ? 'local_audio'
          : track.sourceType === 'spotify'
            ? 'spotify_remote'
            : '',
    }))
}

function buildFavoriteArtistSummary(favoriteRows = [], limit = 5) {
  const artistMap = new Map()

  for (const row of favoriteRows) {
    const track = extractTrackFromFavoriteRow(row)

    for (const artist of track.artists || []) {
      const normalizedName = String(artist || '').trim()

      if (!normalizedName) {
        continue
      }

      const key = normalizedName.toLowerCase()
      const current = artistMap.get(key) || {
        name: normalizedName,
        favoriteCount: 0,
        sourceTypes: new Set(),
      }

      current.favoriteCount += 1
      current.sourceTypes.add(track.sourceType || 'unknown')
      artistMap.set(key, current)
    }
  }

  return [...artistMap.values()]
    .sort((left, right) => {
      if (right.favoriteCount !== left.favoriteCount) {
        return right.favoriteCount - left.favoriteCount
      }

      return left.name.localeCompare(right.name)
    })
    .slice(0, limit)
    .map((artist) => ({
      name: artist.name,
      favoriteCount: artist.favoriteCount,
      sourceTypes: [...artist.sourceTypes],
    }))
}

function buildCommonContextKeywords({
  recentUserMessageRows = [],
  recommendationRows = [],
  playlistRows = [],
  limit = 6,
} = {}) {
  const keywordCounts = new Map()
  const textSamples = [
    ...recentUserMessageRows.map((row) => row.content || ''),
    ...recommendationRows.map((row) => row.prompt || ''),
    ...playlistRows.map((row) => row.title || ''),
  ]

  for (const text of textSamples) {
    const sample = String(text || '')

    if (!sample.trim()) {
      continue
    }

    for (const entry of AGENT_MEMORY_SCENE_KEYWORDS) {
      if (entry.patterns.some((pattern) => pattern.test(sample))) {
        keywordCounts.set(entry.keyword, (keywordCounts.get(entry.keyword) || 0) + 1)
      }
    }
  }

  return [...keywordCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return left[0].localeCompare(right[0])
    })
    .slice(0, limit)
    .map(([keyword, count]) => ({
      keyword,
      count,
    }))
}

function mapPlaylistMemorySummary(row) {
  return {
    id: row.id,
    title: truncateText(row.title || 'Untitled playlist', 64),
    sourceType: row.source_type || 'agentmusic',
    itemCount: row.item_count || 0,
    createdAt: row.created_at || '',
  }
}

function buildRecentDislikedRecommendationSummaries(localUserId, limit = 4) {
  const feedbackRows = loadRecentDislikedRecommendationRows(localUserId, limit)
  const itemHintRows = loadRecommendationItemHintRows(
    feedbackRows
      .map((row) => row.recommendation_run_id || '')
      .filter(Boolean),
  )
  const hintsByRecommendation = new Map()

  for (const row of itemHintRows) {
    const key = row.recommendation_run_id

    if (!key) {
      continue
    }

    const nextHints = hintsByRecommendation.get(key) || []
    nextHints.push(
      truncateText(
        [row.title || 'Unknown track', row.artist_name || '']
          .filter(Boolean)
          .join(' - '),
        64,
      ),
    )
    hintsByRecommendation.set(key, nextHints.slice(0, 3))
  }

  return feedbackRows.map((row) => ({
    recommendationId: row.recommendation_run_id || '',
    title: truncateText(row.recommendation_title || row.recommendation_prompt || 'Untitled recommendation', 72),
    prompt: truncateText(row.recommendation_prompt || '', 96),
    note: truncateText(row.note || '', 72),
    trackHints: hintsByRecommendation.get(row.recommendation_run_id || '') || [],
    createdAt: row.created_at || '',
  }))
}

function buildRecentConversationHighlights(recentUserMessageRows = [], limit = 4) {
  const seen = new Set()

  return recentUserMessageRows
    .filter((row) => {
      const content = truncateText(row.content || '', 96)

      if (!content || seen.has(content)) {
        return false
      }

      seen.add(content)
      return true
    })
    .slice(0, limit)
    .map((row) => ({
      conversationId: row.conversation_id || '',
      conversationTitle: truncateText(row.conversation_title || '', 48),
      content: truncateText(row.content || '', 96),
      createdAt: row.created_at || '',
    }))
}

function buildAgentMemorySummaryText(memoryContext) {
  if (!memoryContext.hasLongTermMemory) {
    return DEFAULT_AGENT_MEMORY_SUMMARY
  }

  const summaryLines = []

  if (memoryContext.frequentLocalAudio.length > 0) {
    summaryLines.push(
      `Local heavy rotation: ${memoryContext.frequentLocalAudio
        .map((track) => formatTrackLabel(track, 56))
        .join('; ')}`,
    )
  }

  if (memoryContext.frequentSpotifyTracks.length > 0) {
    summaryLines.push(
      `Spotify heavy rotation: ${memoryContext.frequentSpotifyTracks
        .map((track) => formatTrackLabel(track, 56))
        .join('; ')}`,
    )
  }

  if (memoryContext.topFavoriteArtists.length > 0) {
    summaryLines.push(
      `Favorite artists: ${memoryContext.topFavoriteArtists
        .map((artist) => `${artist.name} (${artist.favoriteCount})`)
        .join(', ')}`,
    )
  }

  if (memoryContext.commonContextKeywords.length > 0) {
    summaryLines.push(
      `Scenario keywords: ${memoryContext.commonContextKeywords
        .map((item) => item.keyword)
        .join(', ')}`,
    )
  }

  if (memoryContext.recentDislikedRecommendations.length > 0) {
    summaryLines.push(
      `Avoid recently disliked recs: ${memoryContext.recentDislikedRecommendations
        .map((item) => truncateText(item.title || item.prompt || 'Untitled recommendation', 52))
        .join('; ')}`,
    )
  }

  if (memoryContext.recentPlaylists.length > 0) {
    summaryLines.push(
      `Recent playlists: ${memoryContext.recentPlaylists
        .map((playlist) =>
          `${playlist.title} [${playlist.sourceType === 'spotify_import' ? 'spotify import' : 'local'}]`,
        )
        .join('; ')}`,
    )
  }

  if (memoryContext.recentConversationHighlights.length > 0) {
    summaryLines.push(
      `Recent conversation hints: ${memoryContext.recentConversationHighlights
        .map((item) => item.content)
        .join('; ')}`,
    )
  }

  return truncateText(summaryLines.join(' | '), 1200) || DEFAULT_AGENT_MEMORY_SUMMARY
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

export function buildAgentMemoryContext(localUserId) {
  if (!localUserId) {
    return createEmptyAgentMemoryContext({
      mode: 'guest',
      hasLongTermMemory: false,
      summaryText: DEFAULT_AGENT_MEMORY_SUMMARY,
    })
  }

  const favoriteRows = loadFavoriteRows(localUserId)
  const listeningEventRows = loadListeningEventRows(localUserId)
  const recommendationRows = loadRecommendationSummaryRows(localUserId, 6)
  const feedbackRows = loadFeedbackRows(localUserId, 10)
  const playlistRows = loadRecentPlaylistRows(localUserId, 5)
  const recentUserMessageRows = loadRecentUserMessageRows(localUserId, 8)

  const frequentLocalAudio = buildFrequentListeningTracks(listeningEventRows, {
    sourceMatcher(row) {
      return (
        row.source_type === 'local_audio' ||
        row.play_mode === 'local_audio' ||
        String(row.source_id || '').startsWith('local_audio:')
      )
    },
    limit: 4,
  })

  const frequentSpotifyTracks = buildFrequentListeningTracks(listeningEventRows, {
    sourceMatcher(row) {
      return (
        row.source_type === 'spotify' ||
        row.play_mode === 'spotify_remote' ||
        String(row.source_id || '').startsWith('spotify:')
      )
    },
    limit: 4,
  })

  const signalSummary = {
    audioAssetCount: loadAudioAssetCount(localUserId),
    playlistCount: playlistRows.length,
    spotifyImportedPlaylistCount: playlistRows.filter(
      (row) => row.source_type === 'spotify_import',
    ).length,
    favoriteCount: favoriteRows.length,
    listeningEventCount: listeningEventRows.length,
    recommendationCount: recommendationRows.length,
    feedbackCount: feedbackRows.length,
    recentConversationCount: recentUserMessageRows.length,
  }
  const hasLongTermMemory = Object.values(signalSummary).some((value) => Number(value) > 0)

  const memoryContext = createEmptyAgentMemoryContext({
    mode: 'local_user',
    hasLongTermMemory,
    frequentLocalAudio,
    frequentSpotifyTracks,
    topFavoriteArtists: buildFavoriteArtistSummary(favoriteRows, 5),
    commonContextKeywords: buildCommonContextKeywords({
      recentUserMessageRows,
      recommendationRows,
      playlistRows,
      limit: 6,
    }),
    recentDislikedRecommendations: buildRecentDislikedRecommendationSummaries(
      localUserId,
      4,
    ),
    recentPlaylists: playlistRows.map(mapPlaylistMemorySummary).slice(0, 4),
    recentConversationHighlights: buildRecentConversationHighlights(
      recentUserMessageRows,
      4,
    ),
    signalSummary,
  })

  return {
    ...memoryContext,
    summaryText: buildAgentMemorySummaryText(memoryContext),
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
  buildAgentMemoryContext,
  buildLocalTasteProfile,
  buildSpotifyEnhancedProfile,
  mergeSpotifyEnhancement,
  buildUserTasteProfile,
}

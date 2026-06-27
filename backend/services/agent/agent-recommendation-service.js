import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'
import { createTrackArtifact } from './track-artifact.js'

const AGENT_SOURCE_TYPE = 'agentmusic'

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

function createRecommendationSourceId(recommendationId) {
  return `${AGENT_SOURCE_TYPE}:recommendation:${recommendationId}`
}

function resolveConversationId(ownerUserId, conversationId) {
  if (!conversationId) {
    return null
  }

  return (
    db
      .prepare(
        `
          SELECT id
          FROM conversations
          WHERE owner_user_id = ?
            AND id = ?
          LIMIT 1
        `,
      )
      .get(ownerUserId, conversationId)?.id || null
  )
}

function normalizeTrack(track = {}) {
  const artists = Array.isArray(track.artists)
    ? track.artists
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
    : []
  const albumName =
    typeof track.album === 'string'
      ? track.album.trim()
      : typeof track.album?.name === 'string'
        ? track.album.name.trim()
        : ''
  const image =
    typeof track.image === 'string'
      ? track.image.trim()
      : typeof track.image_url === 'string'
        ? track.image_url.trim()
        : ''
  const previewUrl =
    typeof track.previewUrl === 'string'
      ? track.previewUrl.trim()
      : typeof track.preview_url === 'string'
        ? track.preview_url.trim()
        : ''
  const audioUrl =
    typeof track.audioUrl === 'string'
      ? track.audioUrl.trim()
      : typeof track.audio_url === 'string'
        ? track.audio_url.trim()
        : ''
  const durationMs =
    Number.isFinite(Number(track.durationMs)) && Number(track.durationMs) >= 0
      ? Number(track.durationMs)
      : Number.isFinite(Number(track.duration_ms)) && Number(track.duration_ms) >= 0
        ? Number(track.duration_ms)
        : null
  const sourceType =
    typeof track.source_type === 'string'
      ? track.source_type.trim()
      : typeof track.sourceType === 'string'
        ? track.sourceType.trim()
        : 'spotify'
  const sourceId =
    typeof track.source_id === 'string'
      ? track.source_id.trim()
      : typeof track.sourceId === 'string'
        ? track.sourceId.trim()
        : track.id
          ? `${sourceType}:track:${track.id}`
          : `${sourceType}:track:${crypto.randomUUID()}`
  const uri =
    typeof track.uri === 'string'
      ? track.uri.trim()
      : sourceId.startsWith('spotify:')
        ? sourceId
        : ''

  return {
    sourceType,
    sourceId,
    id: typeof track.id === 'string' ? track.id : sourceId,
    name: typeof track.name === 'string' ? track.name.trim() : 'Unknown track',
    artists,
    album: albumName,
    image,
    previewUrl,
    audioUrl,
    durationMs,
    playMode:
      typeof track.playMode === 'string'
        ? track.playMode
        : typeof track.play_mode === 'string'
          ? track.play_mode
          : audioUrl
            ? 'local_audio'
            : uri
              ? 'spotify_remote'
              : previewUrl
              ? 'preview'
              : 'unavailable',
    playable:
      typeof track.playable === 'boolean'
        ? track.playable
        : Boolean(audioUrl || previewUrl),
    metadata:
      track && typeof track === 'object' && !Array.isArray(track)
        ? {
            ...track,
            uri: track.uri || uri,
          }
        : {},
  }
}

function mapRecommendationRun(runRow, itemRows = []) {
  if (!runRow) {
    return null
  }

  return {
    id: runRow.id,
    conversationId: runRow.conversation_id || '',
    title: runRow.title || 'Untitled Recommendation',
    prompt: runRow.prompt || '',
    description: runRow.description || '',
    seeds: parseJson(runRow.seed_summary_json, {}),
    tracks: itemRows.map((itemRow) =>
      createTrackArtifact({
        ...parseJson(itemRow.metadata_json, {}),
        id: parseJson(itemRow.metadata_json, {}).id || itemRow.source_id,
        sourceType: itemRow.source_type,
        sourceId: itemRow.source_id,
        name: itemRow.title || 'Unknown track',
        title: itemRow.title || 'Unknown track',
        artists: itemRow.artist_name
          ? itemRow.artist_name.split(', ').filter(Boolean)
          : [],
        album: itemRow.album_name || '',
        image: parseJson(itemRow.metadata_json, {}).image || '',
        previewUrl: itemRow.preview_url || '',
        durationMs: parseJson(itemRow.metadata_json, {}).durationMs ?? null,
      }),
    ),
    createdAt: runRow.created_at,
    updatedAt: runRow.updated_at,
  }
}

function loadRecommendationItems(recommendationRunId) {
  return db
    .prepare(
      `
        SELECT *
        FROM recommendation_items
        WHERE recommendation_run_id = ?
        ORDER BY position ASC
      `,
    )
    .all(recommendationRunId)
}

export function getStoredRecommendationRun(ownerUserId, recommendationRunId) {
  assert(ownerUserId, 'local user is required', 401)

  const runRow = db
    .prepare(
      `
        SELECT *
        FROM recommendation_runs
        WHERE owner_user_id = ?
          AND id = ?
        LIMIT 1
      `,
    )
    .get(ownerUserId, recommendationRunId)

  if (!runRow) {
    return null
  }

  return mapRecommendationRun(runRow, loadRecommendationItems(recommendationRunId))
}

export function listStoredRecommendationRuns(ownerUserId, limit = 20) {
  assert(ownerUserId, 'local user is required', 401)

  const runRows = db
    .prepare(
      `
        SELECT *
        FROM recommendation_runs
        WHERE owner_user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `,
    )
    .all(ownerUserId, limit)

  return runRows.map((runRow) =>
    mapRecommendationRun(runRow, loadRecommendationItems(runRow.id)),
  )
}

export function saveStoredRecommendationRun(ownerUserId, payload = {}) {
  assert(ownerUserId, 'local user is required', 401)

  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const conversationId = resolveConversationId(ownerUserId, payload.conversationId)
  const normalizedTracks = Array.isArray(payload.tracks)
    ? payload.tracks.map((track) => normalizeTrack(track))
    : []
  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'Untitled Recommendation'

  const insertRun = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO recommendation_runs (
          id,
          owner_user_id,
          conversation_id,
          title,
          prompt,
          description,
          source_type,
          source_id,
          status,
          seed_summary_json,
          constraints_json,
          result_summary_json,
          metadata_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      ownerUserId,
      conversationId,
      title,
      typeof payload.prompt === 'string' ? payload.prompt.trim() : '',
      typeof payload.description === 'string' ? payload.description.trim() : '',
      AGENT_SOURCE_TYPE,
      createRecommendationSourceId(id),
      'ready',
      JSON.stringify(payload.seeds || {}),
      JSON.stringify(payload.constraints || {}),
      JSON.stringify({
        totalTracks: normalizedTracks.length,
        playableTracks: normalizedTracks.filter((track) => track.playable).length,
      }),
      JSON.stringify(payload.metadata || {}),
      createdAt,
      createdAt,
    )

    const insertItem = db.prepare(
      `
        INSERT INTO recommendation_items (
          id,
          recommendation_run_id,
          position,
          source_type,
          source_id,
          title,
          artist_name,
          album_name,
          preview_url,
          metadata_json,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )

    normalizedTracks.forEach((track, index) => {
      insertItem.run(
        crypto.randomUUID(),
        id,
        index,
        track.sourceType,
        track.sourceId,
        track.name,
        track.artists.join(', '),
        track.album,
        track.previewUrl || null,
        JSON.stringify(track),
        createdAt,
      )
    })
  })

  insertRun()
  return getStoredRecommendationRun(ownerUserId, id)
}

export default {
  getStoredRecommendationRun,
  listStoredRecommendationRuns,
  saveStoredRecommendationRun,
}

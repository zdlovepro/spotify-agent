import db from '../db/index.js'
import { assert } from '../utils/assert.js'
import { resolveLocalUserId } from './auth/resolve-local-user-id.js'
import {
  listStoredRecommendationRuns,
  saveStoredRecommendationRun,
} from './agent/agent-recommendation-service.js'

function sanitizeTrack(track = {}) {
  return {
    id: track.id || track.source_id || '',
    source_type: track.source_type || track.sourceType || 'spotify',
    source_id: track.source_id || track.sourceId || track.id || '',
    name: track.name || track.title || 'Unknown track',
    title: track.title || track.name || 'Unknown track',
    artists: Array.isArray(track.artists) ? track.artists : [],
    album:
      typeof track.album === 'string'
        ? track.album
        : track.album?.name || '',
    image: track.image || track.image_url || '',
    previewUrl: track.previewUrl || track.preview_url || '',
    durationMs: track.durationMs ?? track.duration_ms ?? null,
  }
}

function requireLocalUserId(localUserIdOrLegacyUserId) {
  const resolvedLocalUserId = resolveLocalUserId(localUserIdOrLegacyUserId)

  assert(
    resolvedLocalUserId,
    'localUserId is required; legacy spotifyUserId callers must be mapped to a local account first',
    401,
  )

  return resolvedLocalUserId
}

function mapLegacyRecommendationEntry(entry) {
  if (!entry) {
    return null
  }

  return {
    id: entry.id,
    title: entry.title || 'Untitled Recommendation',
    prompt: entry.prompt || '',
    description: entry.description || '',
    seeds: entry.seeds || {},
    tracks: Array.isArray(entry.tracks)
      ? entry.tracks.map((track) => sanitizeTrack(track))
      : [],
    createdAt: entry.createdAt || entry.updatedAt || new Date().toISOString(),
  }
}

export async function listRecommendationHistory(
  localUserIdOrLegacyUserId,
  limit = 20,
) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const entries = listStoredRecommendationRuns(localUserId, limit)

  return entries.map((entry) => mapLegacyRecommendationEntry(entry))
}

export async function saveRecommendationHistory(localUserIdOrLegacyUserId, payload) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const entry = saveStoredRecommendationRun(localUserId, payload)

  return mapLegacyRecommendationEntry(entry)
}

export async function deleteRecommendationHistory(
  localUserIdOrLegacyUserId,
  entryId,
) {
  const localUserId = requireLocalUserId(localUserIdOrLegacyUserId)
  const result = db
    .prepare(
      `
        DELETE FROM recommendation_runs
        WHERE owner_user_id = ?
          AND id = ?
      `,
    )
    .run(localUserId, entryId)

  return result.changes > 0
}

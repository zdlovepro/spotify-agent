import crypto from 'crypto'
import db from '../../db/index.js'
import { assert } from '../../utils/assert.js'
import { getAudioAsset } from '../media/media-service.js'
import { getProviderLink } from '../provider/provider-link-service.js'
import { SPOTIFY_PROVIDER_NAME } from '../provider/spotify-provider-service.js'

const LISTENING_EVENT_TYPES = new Set([
  'play',
  'pause',
  'resume',
  'skip',
  'complete',
  'seek',
  'error',
  'stop',
])

const PLAY_MODE_ALIASES = new Map([
  ['local', 'local_audio'],
  ['local_audio', 'local_audio'],
  ['remote', 'spotify_remote'],
  ['spotify_remote', 'spotify_remote'],
  ['preview', 'preview'],
  ['unavailable', 'unavailable'],
])

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

function nowIso() {
  return new Date().toISOString()
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeInteger(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  const normalized = Number(value)

  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback
  }

  return Math.round(normalized)
}

function normalizeEventType(value) {
  const normalized = normalizeString(value).toLowerCase()
  return LISTENING_EVENT_TYPES.has(normalized) ? normalized : ''
}

function normalizePlayMode(value) {
  const normalized = normalizeString(value).toLowerCase()
  return PLAY_MODE_ALIASES.get(normalized) || ''
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isSensitiveMetadataKey(key) {
  return /(^|_)(access_token|refresh_token|token|authorization|cookie|password|secret)$/i.test(
    key,
  )
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 6) {
    return undefined
  }

  if (value === null) {
    return null
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeMetadataValue(entry, depth + 1))
      .filter((entry) => entry !== undefined)
  }

  if (!isPlainObject(value)) {
    return undefined
  }

  const sanitized = {}

  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) {
      continue
    }

    const nextValue = sanitizeMetadataValue(entry, depth + 1)

    if (nextValue !== undefined) {
      sanitized[key] = nextValue
    }
  }

  return sanitized
}

function deriveAudioAssetId(ownerUserId, sourceType, sourceId, metadata = {}) {
  const explicitAudioAssetId =
    normalizeString(metadata.audioAssetId) ||
    normalizeString(metadata.track?.audioAssetId)

  const derivedAudioAssetId =
    explicitAudioAssetId ||
    (
      sourceType === 'local_audio' && sourceId.startsWith('local_audio:')
        ? sourceId.slice('local_audio:'.length)
        : ''
    )

  if (!derivedAudioAssetId || !ownerUserId) {
    return null
  }

  return getAudioAsset(ownerUserId, derivedAudioAssetId)?.id || null
}

function deriveProviderLinkId(ownerUserId, sourceType, playMode) {
  if (!ownerUserId) {
    return null
  }

  if (sourceType !== 'spotify' && playMode !== 'spotify_remote') {
    return null
  }

  return getProviderLink(ownerUserId, SPOTIFY_PROVIDER_NAME)?.id || null
}

function mapListeningEventRow(row) {
  if (!row) {
    return null
  }

  const metadata = parseJson(row.metadata_json, {})
  const playMode = normalizePlayMode(row.play_mode || metadata.playMode)

  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    owner_user_id: row.owner_user_id,
    sessionId: row.session_id,
    session_id: row.session_id,
    providerLinkId: row.provider_link_id,
    provider_link_id: row.provider_link_id,
    audioAssetId: row.audio_asset_id,
    audio_asset_id: row.audio_asset_id,
    eventType: row.event_type,
    event_type: row.event_type,
    sourceType: row.source_type,
    source_type: row.source_type,
    sourceId: row.source_id,
    source_id: row.source_id,
    playMode: playMode || '',
    play_mode: playMode || '',
    positionMs: row.position_ms ?? 0,
    position_ms: row.position_ms ?? 0,
    durationMs: row.duration_ms ?? null,
    duration_ms: row.duration_ms ?? null,
    contextType: row.context_type || '',
    context_type: row.context_type || '',
    contextId: row.context_id || '',
    context_id: row.context_id || '',
    metadata,
    createdAt: row.created_at,
    created_at: row.created_at,
  }
}

export function createListeningEvent(input = {}) {
  const ownerUserId = normalizeString(input.ownerUserId ?? input.owner_user_id)
  const sessionId = normalizeString(input.sessionId ?? input.session_id)
  const eventType = normalizeEventType(input.eventType ?? input.event_type)
  const sourceType = normalizeString(input.sourceType ?? input.source_type)
  const sourceId = normalizeString(input.sourceId ?? input.source_id)
  const playMode = normalizePlayMode(input.playMode ?? input.play_mode)
  const metadata = sanitizeMetadataValue(input.metadata, 0)
  const positionMs = normalizeInteger(input.positionMs ?? input.position_ms, 0) ?? 0
  const durationMs = normalizeInteger(input.durationMs ?? input.duration_ms)
  const contextType = normalizeString(input.contextType ?? input.context_type)
  const contextId = normalizeString(input.contextId ?? input.context_id)

  assert(ownerUserId, 'owner_user_id is required')
  assert(eventType, 'event_type is required')
  assert(sourceType, 'source_type is required')
  assert(sourceId, 'source_id is required')
  assert(playMode, 'play_mode is required')

  const id = crypto.randomUUID()
  const audioAssetId = deriveAudioAssetId(ownerUserId, sourceType, sourceId, metadata || {})
  const providerLinkId = deriveProviderLinkId(ownerUserId, sourceType, playMode)
  const createdAt = nowIso()

  db.prepare(
    `
      INSERT INTO listening_events (
        id,
        owner_user_id,
        session_id,
        provider_link_id,
        audio_asset_id,
        event_type,
        source_type,
        source_id,
        play_mode,
        position_ms,
        duration_ms,
        context_type,
        context_id,
        metadata_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    ownerUserId || null,
    sessionId || null,
    providerLinkId,
    audioAssetId,
    eventType,
    sourceType,
    sourceId,
    playMode,
    positionMs,
    durationMs,
    contextType || null,
    contextId || null,
    JSON.stringify(metadata || {}),
    createdAt,
  )

  return getListeningEvent(id)
}

export function getListeningEvent(eventId) {
  if (!eventId) {
    return null
  }

  const row = db
    .prepare(
      `
        SELECT *
        FROM listening_events
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(eventId)

  return mapListeningEventRow(row)
}

export default {
  createListeningEvent,
  getListeningEvent,
  LISTENING_EVENT_TYPES,
}

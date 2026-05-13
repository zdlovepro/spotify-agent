import { useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { resolveTrackPlaybackMeta } from '../lib/spotify.js'

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
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

function normalizeArtists(input) {
  if (Array.isArray(input)) {
    return input
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

  if (typeof input === 'string' && input.trim()) {
    return input
      .split(',')
      .map((artist) => artist.trim())
      .filter(Boolean)
  }

  return []
}

function deriveAudioAssetId(track = {}) {
  const explicitAudioAssetId = normalizeString(
    track.audioAssetId || track.audio_asset_id,
  )

  if (explicitAudioAssetId) {
    return explicitAudioAssetId
  }

  const sourceId = normalizeString(track.sourceId || track.source_id)

  if (sourceId.startsWith('local_audio:')) {
    return sourceId.slice('local_audio:'.length)
  }

  return normalizeString(track.id)
}

function derivePlaybackContext(track = {}) {
  const explicitContextType = normalizeString(track.contextType || track.context_type)
  const explicitContextId = normalizeString(track.contextId || track.context_id)

  if (explicitContextType || explicitContextId) {
    return {
      contextType: explicitContextType || 'queue',
      contextId: explicitContextId,
    }
  }

  const playlistId = normalizeString(track.playlistId)

  if (!playlistId) {
    return {
      contextType: 'queue',
      contextId: '',
    }
  }

  if (playlistId.startsWith('agent-')) {
    return {
      contextType: 'agent_queue',
      contextId: playlistId,
    }
  }

  if (playlistId.startsWith('local-audio-')) {
    return {
      contextType: 'local_audio',
      contextId: playlistId,
    }
  }

  return {
    contextType: 'playlist',
    contextId: playlistId,
  }
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

  if (!value || typeof value !== 'object') {
    return undefined
  }

  const sanitized = {}

  for (const [key, entry] of Object.entries(value)) {
    if (
      /(^|_)(access_token|refresh_token|token|authorization|cookie|password|secret)$/i.test(
        key,
      )
    ) {
      continue
    }

    const nextValue = sanitizeMetadataValue(entry, depth + 1)

    if (nextValue !== undefined) {
      sanitized[key] = nextValue
    }
  }

  return sanitized
}

function buildTrackSnapshot(track = {}, playback = {}) {
  const title = normalizeString(
    track.title || track.name || track.trackName || track.songName,
    'Unknown track',
  )
  const album =
    typeof track.album === 'string'
      ? track.album
      : normalizeString(track.album?.name || track.albumName)
  const image = normalizeString(
    track.image ||
      track.image_url ||
      track.trackImg ||
      track.songimg ||
      track.album?.images?.[0]?.url,
  )
  const sourceType = normalizeString(
    track.sourceType || track.source_type,
    playback.isSpotifyRemote ? 'spotify' : playback.isLocalAudio ? 'local_audio' : '',
  )
  const sourceId = normalizeString(
    track.sourceId || track.source_id || playback.remoteUri,
  )

  return {
    id: normalizeString(track.id, sourceId),
    title,
    name: title,
    trackName: title,
    artists: normalizeArtists(
      track.artists || track.artist || track.trackArtist || track.songArtist,
    ),
    album,
    albumName: album,
    image,
    durationMs:
      normalizeInteger(track.durationMs ?? track.duration_ms) ?? 0,
    sourceType,
    sourceId,
    playMode: normalizeString(track.playMode || track.play_mode, playback.playMode),
    uri: normalizeString(track.uri || playback.remoteUri),
    audioAssetId:
      sourceType === 'local_audio' ? deriveAudioAssetId(track) : '',
    playlistId: normalizeString(track.playlistId),
    playlistTitle: normalizeString(track.playlistTitle),
    queueIndex: normalizeInteger(track.queueIndex, 0) ?? 0,
  }
}

export function usePlayerEventReporter() {
  const { isAuthenticated, request } = useAuth()

  return useCallback(
    async ({
      eventType,
      track,
      positionMs = null,
      durationMs = null,
      contextType = '',
      contextId = '',
      metadata = {},
    } = {}) => {
      if (!isAuthenticated || !track || typeof track !== 'object') {
        return null
      }

      const playback = resolveTrackPlaybackMeta(track)
      const sourceType = normalizeString(
        track.sourceType || track.source_type,
        playback.isSpotifyRemote ? 'spotify' : playback.isLocalAudio ? 'local_audio' : '',
      )
      const sourceId = normalizeString(
        track.sourceId || track.source_id || playback.remoteUri,
      )
      const playMode = normalizeString(
        track.playMode || track.play_mode,
        playback.playMode,
      )

      if (!eventType || !sourceType || !sourceId || !playMode) {
        return null
      }

      const fallbackContext = derivePlaybackContext(track)
      const trackSnapshot = buildTrackSnapshot(track, playback)
      const payload = {
        eventType,
        sourceType,
        sourceId,
        playMode,
        positionMs: normalizeInteger(positionMs, 0) ?? 0,
        durationMs:
          normalizeInteger(durationMs) ??
          normalizeInteger(track.durationMs ?? track.duration_ms) ??
          trackSnapshot.durationMs,
        contextType: normalizeString(contextType, fallbackContext.contextType),
        contextId: normalizeString(contextId, fallbackContext.contextId),
        metadata: sanitizeMetadataValue({
          ...metadata,
          track: trackSnapshot,
        }),
      }

      return request('/api/player/events', {
        method: 'POST',
        body: payload,
      })
    },
    [isAuthenticated, request],
  )
}

export default usePlayerEventReporter

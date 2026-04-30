/**
 * @typedef {'preview' | 'local' | 'remote' | 'unavailable'} TrackPlayMode
 */

/**
 * @typedef {Object} TrackArtifact
 * @property {string} id
 * @property {string} sourceType
 * @property {string} sourceId
 * @property {string} name
 * @property {string[]} artists
 * @property {string} album
 * @property {string} image
 * @property {number} durationMs
 * @property {string} previewUrl
 * @property {string} audioUrl
 * @property {boolean} playable
 * @property {TrackPlayMode} playMode
 */

const VALID_PLAY_MODES = new Set(['preview', 'local', 'remote', 'unavailable'])

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeArtists(artists) {
  if (!Array.isArray(artists)) {
    if (typeof artists === 'string' && artists.trim()) {
      return artists
        .split(',')
        .map((artist) => artist.trim())
        .filter(Boolean)
    }

    return []
  }

  return artists
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

function getAlbumName(track) {
  if (typeof track?.album === 'string') {
    return track.album
  }

  return normalizeString(track?.album?.name)
}

function getImage(track) {
  return normalizeString(
    track?.image ||
      track?.image_url ||
      track?.images?.[0]?.url ||
      track?.album?.images?.[0]?.url,
  )
}

function getSourceType(track) {
  return normalizeString(track?.sourceType || track?.source_type, 'spotify')
}

function getSourceId(track, sourceType) {
  const explicitSourceId = normalizeString(track?.sourceId || track?.source_id)

  if (explicitSourceId) {
    return explicitSourceId
  }

  const id = normalizeString(track?.id)

  if (id) {
    return `${sourceType}:track:${id}`
  }

  return `${sourceType}:track:unknown`
}

function getPreviewUrl(track) {
  return normalizeString(track?.previewUrl || track?.preview_url)
}

function getAudioUrl(track) {
  return normalizeString(track?.audioUrl || track?.audio_url || track?.streamUrl)
}

function getRemoteUrl(track) {
  return normalizeString(
    track?.remoteUrl ||
      track?.remote_url ||
      track?.external_url ||
      track?.externalUrl ||
      track?.uri,
  )
}

function derivePlayMode(track, audioUrl, previewUrl, remoteUrl) {
  const explicitPlayMode = normalizeString(track?.playMode || track?.play_mode)

  if (VALID_PLAY_MODES.has(explicitPlayMode)) {
    return explicitPlayMode
  }

  if (audioUrl) {
    return 'local'
  }

  if (previewUrl) {
    return 'preview'
  }

  if (remoteUrl) {
    return 'remote'
  }

  return 'unavailable'
}

function derivePlayable(track, playMode, audioUrl, previewUrl) {
  const directlyPlayable =
    (playMode === 'local' && Boolean(audioUrl)) ||
    (playMode === 'preview' && Boolean(previewUrl))

  if (typeof track?.playable === 'boolean') {
    return track.playable && directlyPlayable
  }

  return directlyPlayable
}

export function createTrackArtifact(track = {}) {
  const sourceType = getSourceType(track)
  const sourceId = getSourceId(track, sourceType)
  const previewUrl = getPreviewUrl(track)
  const audioUrl = getAudioUrl(track)
  const remoteUrl = getRemoteUrl(track)
  const playMode = derivePlayMode(track, audioUrl, previewUrl, remoteUrl)

  return {
    id: normalizeString(track?.id, sourceId),
    sourceType,
    sourceId,
    name: normalizeString(track?.name || track?.title, 'Unknown track'),
    artists: normalizeArtists(track?.artists || track?.artist),
    album: getAlbumName(track),
    image: getImage(track),
    durationMs:
      Number.isFinite(Number(track?.durationMs)) && Number(track.durationMs) >= 0
        ? Number(track.durationMs)
        : Number.isFinite(Number(track?.duration_ms)) && Number(track.duration_ms) >= 0
          ? Number(track.duration_ms)
          : 0,
    previewUrl,
    audioUrl,
    playable: derivePlayable(track, playMode, audioUrl, previewUrl),
    playMode,
    uri: normalizeString(track?.uri),
    remoteUrl,
  }
}

export function createTrackArtifacts(tracks = []) {
  return (Array.isArray(tracks) ? tracks : []).map((track) => createTrackArtifact(track))
}

export default {
  createTrackArtifact,
  createTrackArtifacts,
}

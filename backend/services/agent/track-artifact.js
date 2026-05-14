/**
 * @typedef {'local_audio' | 'spotify_remote' | 'preview' | 'unavailable'} TrackPlayMode
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
 * @property {string} audioUrl
 * @property {string} uri
 * @property {boolean} playable
 * @property {TrackPlayMode} playMode
 */

const PLAY_MODE_ALIASES = new Map([
  ['local', 'local_audio'],
  ['local_audio', 'local_audio'],
  ['remote', 'spotify_remote'],
  ['spotify_remote', 'spotify_remote'],
  ['preview', 'preview'],
  ['unavailable', 'unavailable'],
])

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

  const uri = normalizeString(
    track?.uri ||
      track?.remoteUri ||
      track?.remote_url ||
      track?.remoteUrl,
  )

  if (uri.startsWith('spotify:')) {
    return uri
  }

  const id = normalizeString(track?.id)

  if (id) {
    return `${sourceType}:track:${id}`
  }

  return ''
}

function getPreviewUrl(track) {
  return normalizeString(track?.previewUrl || track?.preview_url)
}

function getLocalAudioUrl(track) {
  return normalizeString(track?.audioUrl || track?.audio_url || track?.streamUrl)
}

function getSpotifyUri(track) {
  const uri = normalizeString(
    track?.uri ||
      track?.remoteUri ||
      track?.remote_url ||
      track?.remoteUrl ||
      track?.sourceId ||
      track?.source_id,
  )

  return uri.startsWith('spotify:') ? uri : ''
}

function normalizeTrackPlayMode(playMode) {
  return PLAY_MODE_ALIASES.get(normalizeString(playMode)) || ''
}

function derivePlayMode(track, localAudioUrl, previewUrl, uri) {
  const explicitPlayMode = normalizeTrackPlayMode(track?.playMode || track?.play_mode)

  if (explicitPlayMode) {
    return explicitPlayMode
  }

  if (localAudioUrl) {
    return 'local_audio'
  }

  if (uri) {
    return 'spotify_remote'
  }

  if (previewUrl) {
    return 'preview'
  }

  return 'unavailable'
}

function derivePlayable(track, playMode, localAudioUrl, previewUrl, uri) {
  const directlyPlayable =
    (playMode === 'local_audio' && Boolean(localAudioUrl)) ||
    (playMode === 'preview' && Boolean(previewUrl)) ||
    (playMode === 'spotify_remote' && Boolean(uri))

  if (typeof track?.playable === 'boolean') {
    if (playMode === 'spotify_remote') {
      return directlyPlayable
    }

    return track.playable && directlyPlayable
  }

  return directlyPlayable
}

export function createTrackArtifact(track = {}) {
  const sourceType = getSourceType(track)
  const sourceId = getSourceId(track, sourceType)
  const previewUrl = getPreviewUrl(track)
  const localAudioUrl = getLocalAudioUrl(track)
  const uri = getSpotifyUri(track)
  const playMode = derivePlayMode(track, localAudioUrl, previewUrl, uri)
  const audioUrl =
    playMode === 'local_audio'
      ? localAudioUrl
      : playMode === 'preview'
        ? previewUrl
        : ''

  return {
    id: normalizeString(track?.id, sourceId),
    sourceType,
    sourceId,
    name: normalizeString(track?.name || track?.title),
    artists: normalizeArtists(track?.artists || track?.artist),
    album: getAlbumName(track),
    image: getImage(track),
    durationMs:
      Number.isFinite(Number(track?.durationMs)) && Number(track.durationMs) >= 0
        ? Number(track.durationMs)
        : Number.isFinite(Number(track?.duration_ms)) && Number(track.duration_ms) >= 0
          ? Number(track.duration_ms)
          : 0,
    audioUrl,
    uri: uri || normalizeString(track?.uri),
    playable: derivePlayable(track, playMode, localAudioUrl, previewUrl, uri),
    playMode,
  }
}

export function createTrackArtifacts(tracks = []) {
  return (Array.isArray(tracks) ? tracks : []).map((track) => createTrackArtifact(track))
}

export default {
  createTrackArtifact,
  createTrackArtifacts,
}

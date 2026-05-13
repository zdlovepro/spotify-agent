import fallbackArtwork from '../assets/hero.png'
import { BACKEND_BASE_URL } from './api.js'

function formatDuration(durationMs = 0) {
  const safeDuration = Math.max(0, Number(durationMs) || 0)
  const totalSeconds = Math.floor(safeDuration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function formatFileSize(sizeBytes = 0) {
  const safeSize = Math.max(0, Number(sizeBytes) || 0)

  if (safeSize >= 1024 * 1024) {
    return `${(safeSize / (1024 * 1024)).toFixed(1)} MB`
  }

  if (safeSize >= 1024) {
    return `${Math.round(safeSize / 1024)} KB`
  }

  return `${safeSize} B`
}

export function getLocalAudioStreamUrl(asset, sessionToken = '') {
  if (!asset?.streamPath) {
    return ''
  }

  const appendSessionToken = (url) => {
    if (!sessionToken) {
      return url
    }

    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}session_token=${encodeURIComponent(sessionToken)}`
  }

  if (asset.streamPath.startsWith('http://') || asset.streamPath.startsWith('https://')) {
    return appendSessionToken(asset.streamPath)
  }

  return appendSessionToken(`${BACKEND_BASE_URL}${asset.streamPath}`)
}

export function createLocalAudioTrack(asset, sessionToken = '') {
  const audioUrl = getLocalAudioStreamUrl(asset, sessionToken)
  const artists = Array.isArray(asset.artists) ? asset.artists : []

  return {
    id: asset.id,
    source_type: 'local_audio',
    source_id: asset.sourceId || `local_audio:${asset.id}`,
    name: asset.title || asset.originalFilename || 'Local audio',
    artists,
    album: asset.album || '',
    originalFilename: asset.originalFilename || '',
    mimeType: asset.mimeType || '',
    fileExtension: asset.fileExtension || '',
    sizeBytes: asset.sizeBytes || 0,
    streamPath: asset.streamPath || '',
    duration_ms: asset.durationMs || 0,
    audio_url: audioUrl,
    playMode: 'local_audio',
    playable: true,
    image: fallbackArtwork,
  }
}

export function mapLocalAudioCard(asset) {
  const normalizedExtension = String(asset.fileExtension || '').toLowerCase()
  const normalizedMimeType = String(asset.mimeType || '').toLowerCase()
  const fallbackFormatLabel =
    normalizedExtension === '.mp3' ||
    normalizedMimeType === 'audio/mpeg' ||
    normalizedMimeType === 'audio/mp3'
      ? 'mp3'
      : normalizedExtension === '.m4a' ||
          normalizedMimeType === 'audio/mp4' ||
          normalizedMimeType === 'audio/x-m4a'
        ? 'm4a'
        : 'm4a / mp3'

  return {
    id: asset.id,
    title: asset.title || asset.originalFilename || 'Local audio',
    albumText: asset.album || '',
    artistText:
      Array.isArray(asset.artists) && asset.artists.length
        ? asset.artists.join(', ')
        : 'Local audio',
    formatLabel: fallbackFormatLabel,
    durationText: asset.durationMs
      ? formatDuration(asset.durationMs)
      : fallbackFormatLabel,
    sizeText: formatFileSize(asset.sizeBytes || 0),
    imageUrl: fallbackArtwork,
  }
}

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
  return {
    id: asset.id,
    source_type: 'local_audio',
    source_id: asset.sourceId || `local_audio:${asset.id}`,
    name: asset.title || asset.originalFilename || 'Local audio',
    artists: Array.isArray(asset.artists) ? asset.artists : [],
    duration_ms: asset.durationMs || 0,
    preview_url: getLocalAudioStreamUrl(asset, sessionToken),
    image: fallbackArtwork,
  }
}

export function mapLocalAudioCard(asset) {
  return {
    id: asset.id,
    title: asset.title || asset.originalFilename || 'Local audio',
    artistText:
      Array.isArray(asset.artists) && asset.artists.length
        ? asset.artists.join(', ')
        : 'Local audio file',
    durationText: asset.durationMs ? formatDuration(asset.durationMs) : 'm4a',
    sizeText: formatFileSize(asset.sizeBytes || 0),
    imageUrl: fallbackArtwork,
  }
}

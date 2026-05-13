import { assert } from '../../utils/assert.js'
import {
  getProviderLink,
  refreshProviderToken,
} from './provider-link-service.js'
import { SPOTIFY_PROVIDER_NAME } from './spotify-provider-service.js'
import {
  getAvailableDevices,
  getCurrentPlaybackState,
  pausePlayback,
  skipToNextPlayback,
  skipToPreviousPlayback,
  startOrResumePlayback,
  transferPlayback as transferSpotifyPlayback,
} from '../spotify-api.js'

const PLAYBACK_READ_SCOPES = [
  'user-read-playback-state',
  'user-read-currently-playing',
]

const PLAYBACK_WRITE_SCOPES = ['user-modify-playback-state']

function createSpotifyPlayerError(message, code, status = 500, details = null) {
  const error = new Error(message)
  error.code = code
  error.status = status

  if (details) {
    error.details = details
  }

  return error
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeDeviceId(value) {
  return normalizeString(value)
}

function normalizeArtistNames(artists = []) {
  return (Array.isArray(artists) ? artists : [])
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

function mapSpotifyDevice(device = {}) {
  return {
    id: device.id || '',
    name: device.name || '',
    type: device.type || '',
    isActive: Boolean(device.is_active),
    isPrivateSession: Boolean(device.is_private_session),
    isRestricted: Boolean(device.is_restricted),
    volumePercent: device.volume_percent ?? null,
  }
}

function mapSpotifyPlaybackTrack(track = {}) {
  return {
    id: track.id || '',
    sourceType: 'spotify',
    sourceId: track.id ? `spotify:track:${track.id}` : normalizeString(track.uri),
    uri: normalizeString(track.uri),
    name: track.name || '',
    artists: normalizeArtistNames(track.artists),
    album:
      typeof track.album === 'string'
        ? track.album
        : normalizeString(track.album?.name),
    image: track.album?.images?.[0]?.url || '',
    durationMs: track.duration_ms ?? null,
    playMode: 'spotify_remote',
    playable: false,
  }
}

function mapSpotifyPlaybackState(playbackState, devices = []) {
  const normalizedState =
    playbackState && typeof playbackState === 'object' ? playbackState : {}
  const device =
    normalizedState.device && typeof normalizedState.device === 'object'
      ? mapSpotifyDevice(normalizedState.device)
      : null
  const item =
    normalizedState.item && typeof normalizedState.item === 'object'
      ? mapSpotifyPlaybackTrack(normalizedState.item)
      : null

  return {
    isPlaying: Boolean(normalizedState.is_playing),
    progressMs:
      Number.isFinite(Number(normalizedState.progress_ms)) &&
      Number(normalizedState.progress_ms) >= 0
        ? Number(normalizedState.progress_ms)
        : null,
    shuffleState: Boolean(normalizedState.shuffle_state),
    repeatState: normalizeString(normalizedState.repeat_state, 'off'),
    timestamp: normalizedState.timestamp ?? null,
    device,
    item,
    context:
      normalizedState.context && typeof normalizedState.context === 'object'
        ? {
            type: normalizeString(normalizedState.context.type),
            uri: normalizeString(normalizedState.context.uri),
          }
        : null,
    hasActiveDevice: Boolean(device?.id),
    availableDevices: devices.map((entry) => mapSpotifyDevice(entry)),
  }
}

function isPremiumRequiredMessage(message = '') {
  const normalized = String(message || '').toLowerCase()
  return normalized.includes('premium required')
}

function isNoActiveDeviceMessage(message = '') {
  const normalized = String(message || '').toLowerCase()
  return (
    normalized.includes('no active device') ||
    normalized.includes('device not found') ||
    normalized.includes('no available device')
  )
}

function ensureAllowedPlaybackUri(uri, { allowContext = true } = {}) {
  const normalizedUri = normalizeString(uri)

  assert(normalizedUri, 'Spotify URI is required', 400)
  assert(
    normalizedUri.startsWith('spotify:track:') ||
      (allowContext &&
        (normalizedUri.startsWith('spotify:album:') ||
          normalizedUri.startsWith('spotify:playlist:'))),
    'Only Spotify track, album, or playlist URIs are allowed',
    400,
  )

  return normalizedUri
}

function mapSpotifyPlaybackError(error, fallbackMessage, fallbackCode = 'spotify_playback_failed') {
  if (error?.code && String(error.code).startsWith('spotify_')) {
    return error
  }

  const status = error?.status || error?.response?.status || 500
  const details = error?.details || error?.response?.data || null
  const message = error?.message || fallbackMessage

  if (isPremiumRequiredMessage(message)) {
    return createSpotifyPlayerError(
      'Spotify Premium is required for full playback.',
      'spotify_premium_required',
      403,
      details,
    )
  }

  if (isNoActiveDeviceMessage(message) || status === 404) {
    return createSpotifyPlayerError(
      'No active Spotify playback device is available.',
      'spotify_no_active_device',
      409,
      details,
    )
  }

  if (status === 403) {
    return createSpotifyPlayerError(
      'Spotify playback is forbidden for the current account or device.',
      'spotify_forbidden',
      403,
      details,
    )
  }

  return createSpotifyPlayerError(message, fallbackCode, status, details)
}

async function getActiveSpotifyProviderLink(localUserId, requiredScopes = []) {
  assert(localUserId, 'Local user authentication required', 401)

  const providerLink = getProviderLink(localUserId, SPOTIFY_PROVIDER_NAME)

  if (!providerLink) {
    throw createSpotifyPlayerError(
      'Spotify is not connected for the current user.',
      'spotify_not_connected',
      403,
    )
  }

  const activeProviderLink = await refreshProviderToken(providerLink)

  if (!activeProviderLink?.accessToken) {
    throw createSpotifyPlayerError(
      'Spotify is not connected for the current user.',
      'spotify_not_connected',
      403,
    )
  }

  const grantedScopes = Array.isArray(activeProviderLink.scopes)
    ? activeProviderLink.scopes
    : []
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

  if (missingScopes.length > 0) {
    throw createSpotifyPlayerError(
      `Reconnect Spotify to grant playback permissions: ${missingScopes.join(', ')}`,
      'spotify_forbidden',
      403,
      { missingScopes },
    )
  }

  return activeProviderLink
}

async function loadSpotifyDevices(localUserId, providerLink = null) {
  const activeProviderLink =
    providerLink ||
    (await getActiveSpotifyProviderLink(localUserId, PLAYBACK_READ_SCOPES))

  try {
    const deviceData = await getAvailableDevices(activeProviderLink.accessToken)
    const devices = Array.isArray(deviceData?.devices) ? deviceData.devices : []

    return {
      providerLink: activeProviderLink,
      devices,
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to load Spotify devices.',
      'spotify_playback_failed',
    )
  }
}

function pickPlaybackDevice(devices = [], preferredDeviceId = '') {
  const normalizedPreferredDeviceId = normalizeDeviceId(preferredDeviceId)
  const availableDevices = (Array.isArray(devices) ? devices : []).filter(
    (device) => device && !device.is_restricted,
  )

  if (!availableDevices.length) {
    throw createSpotifyPlayerError(
      'No active Spotify playback device is available.',
      'spotify_no_active_device',
      409,
    )
  }

  if (normalizedPreferredDeviceId) {
    const preferredDevice = availableDevices.find(
      (device) => device.id === normalizedPreferredDeviceId,
    )

    if (!preferredDevice) {
      throw createSpotifyPlayerError(
        'The requested Spotify playback device is not available.',
        'spotify_no_active_device',
        409,
      )
    }

    return preferredDevice
  }

  const activeDevice = availableDevices.find((device) => device.is_active)

  if (!activeDevice) {
    throw createSpotifyPlayerError(
      'No active Spotify playback device is available.',
      'spotify_no_active_device',
      409,
    )
  }

  return activeDevice
}

async function ensurePlaybackTarget(localUserId, { deviceId = '', scopes = PLAYBACK_WRITE_SCOPES } = {}) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId, [
    ...PLAYBACK_READ_SCOPES,
    ...scopes,
  ])
  const { devices } = await loadSpotifyDevices(localUserId, providerLink)
  const device = pickPlaybackDevice(devices, deviceId)

  return {
    accessToken: providerLink.accessToken,
    device,
    devices,
  }
}

export async function listDevices(localUserId) {
  const { devices } = await loadSpotifyDevices(localUserId)

  return {
    total: devices.length,
    items: devices.map((device) => mapSpotifyDevice(device)),
  }
}

export async function getCurrentPlayback(localUserId) {
  const providerLink = await getActiveSpotifyProviderLink(localUserId, PLAYBACK_READ_SCOPES)
  const { devices } = await loadSpotifyDevices(localUserId, providerLink)

  try {
    const playbackState = await getCurrentPlaybackState(providerLink.accessToken)
    return mapSpotifyPlaybackState(playbackState, devices)
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to load current Spotify playback state.',
      'spotify_playback_failed',
    )
  }
}

export async function transferPlayback(localUserId, deviceId, play = true) {
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    await transferSpotifyPlayback(accessToken, {
      deviceId: device.id,
      play: Boolean(play),
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
      play: Boolean(play),
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to transfer Spotify playback.',
      'spotify_playback_failed',
    )
  }
}

export async function playUri(localUserId, uri, options = {}) {
  const playbackUri = ensureAllowedPlaybackUri(uri, { allowContext: true })
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    if (!device.is_active) {
      await transferSpotifyPlayback(accessToken, {
        deviceId: device.id,
        play: false,
      })
    }

    if (playbackUri.startsWith('spotify:track:')) {
      await startOrResumePlayback(accessToken, {
        deviceId: device.id,
        uris: [playbackUri],
        positionMs: options.positionMs,
      })
    } else {
      await startOrResumePlayback(accessToken, {
        deviceId: device.id,
        contextUri: playbackUri,
        offset:
          options.offset && typeof options.offset === 'object'
            ? options.offset
            : null,
        positionMs: options.positionMs,
      })
    }

    return {
      ok: true,
      device: mapSpotifyDevice(device),
      uri: playbackUri,
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to start Spotify playback.',
      'spotify_playback_failed',
    )
  }
}

export async function playUris(localUserId, uris, options = {}) {
  const playbackUris = (Array.isArray(uris) ? uris : [])
    .map((uri) => ensureAllowedPlaybackUri(uri, { allowContext: false }))
    .filter(Boolean)

  assert(playbackUris.length > 0, 'At least one Spotify track URI is required', 400)

  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    if (!device.is_active) {
      await transferSpotifyPlayback(accessToken, {
        deviceId: device.id,
        play: false,
      })
    }

    await startOrResumePlayback(accessToken, {
      deviceId: device.id,
      uris: playbackUris,
      offset:
        options.offset && typeof options.offset === 'object'
          ? options.offset
          : null,
      positionMs: options.positionMs,
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
      uris: playbackUris,
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to start Spotify playback queue.',
      'spotify_playback_failed',
    )
  }
}

export async function pause(localUserId, options = {}) {
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    await pausePlayback(accessToken, {
      deviceId: device.id,
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to pause Spotify playback.',
      'spotify_playback_failed',
    )
  }
}

export async function resume(localUserId, options = {}) {
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    if (!device.is_active) {
      await transferSpotifyPlayback(accessToken, {
        deviceId: device.id,
        play: false,
      })
    }

    await startOrResumePlayback(accessToken, {
      deviceId: device.id,
      positionMs: options.positionMs,
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to resume Spotify playback.',
      'spotify_playback_failed',
    )
  }
}

export async function next(localUserId, options = {}) {
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    await skipToNextPlayback(accessToken, {
      deviceId: device.id,
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to skip to the next Spotify track.',
      'spotify_playback_failed',
    )
  }
}

export async function previous(localUserId, options = {}) {
  const { accessToken, device } = await ensurePlaybackTarget(localUserId, {
    deviceId: options.deviceId,
    scopes: PLAYBACK_WRITE_SCOPES,
  })

  try {
    await skipToPreviousPlayback(accessToken, {
      deviceId: device.id,
    })

    return {
      ok: true,
      device: mapSpotifyDevice(device),
    }
  } catch (error) {
    throw mapSpotifyPlaybackError(
      error,
      'Failed to go back to the previous Spotify track.',
      'spotify_playback_failed',
    )
  }
}

export default {
  listDevices,
  getCurrentPlayback,
  transferPlayback,
  playUri,
  playUris,
  pause,
  resume,
  next,
  previous,
}

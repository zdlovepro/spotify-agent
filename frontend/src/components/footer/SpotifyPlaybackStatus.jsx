import { useState } from 'react'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../../context/SpotifyPlaybackContext.jsx'
import { resolveTrackPlaybackMeta, TRACK_PLAY_MODES } from '../../lib/spotify.js'
import styles from './footer.module.css'

function truncateDeviceId(deviceId) {
  if (!deviceId) {
    return ''
  }

  if (deviceId.length <= 18) {
    return deviceId
  }

  return `${deviceId.slice(0, 8)}...${deviceId.slice(-6)}`
}

function resolveSpotifyStatus({
  isLocalAuthenticated,
  isConnected,
  isConnecting,
  isReady,
  errorCode,
}) {
  if (!isLocalAuthenticated || !isConnected) {
    return {
      key: 'spotify_playback_status_connect',
      tone: 'muted',
    }
  }

  if (errorCode === 'spotify_premium_required') {
    return {
      key: 'spotify_playback_status_premium',
      tone: 'warning',
    }
  }

  if (errorCode === 'spotify_no_active_device') {
    return {
      key: 'spotify_playback_status_no_device',
      tone: 'warning',
    }
  }

  if (isReady) {
    return {
      key: 'spotify_playback_status_ready',
      tone: 'ready',
    }
  }

  if (isConnecting) {
    return {
      key: 'spotify_playback_status_connecting',
      tone: 'muted',
    }
  }

  return {
    key: 'spotify_playback_status_no_device',
    tone: 'warning',
  }
}

function SpotifyPlaybackStatus() {
  const { t } = useTranslation()
  const trackData = useSelector((state) => state.player.trackData)
  const playback = resolveTrackPlaybackMeta(trackData)
  const { isAuthenticated: isLocalAuthenticated } = useAuth()
  const { connect, isConnected } = useSpotify()
  const {
    activatePlayer,
    deviceId,
    error,
    errorCode,
    isActive,
    isConnecting,
    isReady,
  } = useSpotifyPlayback()
  const [isActivating, setIsActivating] = useState(false)
  const [isConnectingSpotify, setIsConnectingSpotify] = useState(false)

  if (playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO) {
    return null
  }

  if (playback.playMode === TRACK_PLAY_MODES.PREVIEW) {
    return (
      <div className={styles.spotifyStatusRow}>
        <span className={`${styles.spotifyStatusBadge} ${styles.muted}`}>
          {t('agent_playback_preview')}
        </span>
        <span className={styles.spotifyStatusHint}>
          {t('player_preview_hint')}
        </span>
      </div>
    )
  }

  if (playback.playMode === TRACK_PLAY_MODES.UNAVAILABLE) {
    return (
      <div className={styles.spotifyStatusRow}>
        <span className={`${styles.spotifyStatusBadge} ${styles.warning}`}>
          {t('agent_playback_unavailable')}
        </span>
        <span className={styles.spotifyStatusHint}>
          {t('player_unavailable_hint')}
        </span>
      </div>
    )
  }

  const status = resolveSpotifyStatus({
    isLocalAuthenticated,
    isConnected,
    isConnecting,
    isReady,
    errorCode,
  })

  const handleActivate = async () => {
    setIsActivating(true)

    try {
      await activatePlayer()
    } finally {
      setIsActivating(false)
    }
  }

  const handleConnectSpotify = async () => {
    setIsConnectingSpotify(true)

    try {
      await connect()
    } catch {
      // Keep the status UI visible; connection errors surface in provider state.
    } finally {
      setIsConnectingSpotify(false)
    }
  }

  const shouldShowConnectButton = !isConnected || !isLocalAuthenticated
  const shouldShowActivateButton =
    isLocalAuthenticated &&
    isConnected &&
    isReady &&
    !isActive &&
    errorCode !== 'spotify_premium_required'
  const hintKey =
    !isConnected || !isLocalAuthenticated
      ? 'player_spotify_connect_hint'
      : errorCode === 'spotify_no_active_device'
        ? 'player_spotify_device_hint'
        : isReady && !isActive
          ? 'player_spotify_activate_hint'
          : ''

  return (
    <div className={styles.spotifyStatusRow}>
      <span className={`${styles.spotifyStatusBadge} ${styles[status.tone]}`}>
        {t(status.key)}
      </span>
      {deviceId ? (
        <code className={styles.spotifyDeviceId}>
          {t('spotify_playback_device_id', {
            deviceId: truncateDeviceId(deviceId),
          })}
        </code>
      ) : null}
      {shouldShowConnectButton ? (
        <button
          className={styles.spotifyActivateButton}
          onClick={handleConnectSpotify}
          disabled={isConnectingSpotify}
          type="button"
        >
          {isConnectingSpotify ? t('spotify_playback_status_connecting') : t('spotify_connect')}
        </button>
      ) : null}
      {shouldShowActivateButton ? (
        <button
          className={styles.spotifyActivateButton}
          onClick={handleActivate}
          disabled={isActivating}
          type="button"
        >
          {isActivating
            ? t('spotify_playback_status_connecting')
            : t('spotify_playback_activate')}
        </button>
      ) : null}
      {hintKey ? (
        <span className={styles.spotifyStatusHint}>{t(hintKey)}</span>
      ) : null}
      {error && errorCode && errorCode !== 'spotify_premium_required' ? (
        <span className={styles.spotifyStatusHint}>{error}</span>
      ) : null}
    </div>
  )
}

export default SpotifyPlaybackStatus

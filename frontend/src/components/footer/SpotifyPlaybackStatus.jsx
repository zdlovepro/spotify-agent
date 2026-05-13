import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../../context/SpotifyPlaybackContext.jsx'
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

function resolveStatus({ isLocalAuthenticated, isConnected, isConnecting, isReady, errorCode }) {
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
    key: 'spotify_playback_status_connecting',
    tone: 'muted',
  }
}

function SpotifyPlaybackStatus() {
  const { t } = useTranslation()
  const { isAuthenticated: isLocalAuthenticated } = useAuth()
  const { isConnected } = useSpotify()
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
  const status = resolveStatus({
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

  const shouldShowActivateButton =
    isLocalAuthenticated &&
    isConnected &&
    isReady &&
    !isActive &&
    errorCode !== 'spotify_premium_required'

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
      {error && errorCode && errorCode !== 'spotify_premium_required' ? (
        <span className={styles.spotifyStatusHint}>{error}</span>
      ) : null}
    </div>
  )
}

export default SpotifyPlaybackStatus

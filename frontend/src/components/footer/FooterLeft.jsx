import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../../context/SpotifyPlaybackContext.jsx'
import * as Icons from '../icons/index.jsx'
import TextRegularM from '../text/TextRegularM'
import IconButton from '../buttons/IconButton'
import { resolveTrackPlaybackMeta, TRACK_PLAY_MODES } from '../../lib/spotify.js'
import styles from './footer-left.module.css'

function getLocalAudioFormatLabel(trackData) {
  const normalizedExtension = String(trackData.fileExtension || '').toLowerCase()

  if (normalizedExtension === '.mp3') {
    return 'mp3'
  }

  if (normalizedExtension === '.m4a') {
    return 'm4a'
  }

  return 'm4a / mp3'
}

function buildPlaybackBadges({
  playback,
  trackData,
  isConnected,
  isConnecting,
  spotifyErrorCode,
  spotifyReady,
  t,
}) {
  if (playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO) {
    return [
      {
        label: t('player_source_local_audio'),
        tone: 'source',
      },
      {
        label: t('agent_playback_full'),
        tone: 'ready',
      },
      {
        label: getLocalAudioFormatLabel(trackData),
        tone: 'subtle',
      },
    ]
  }

  if (playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE) {
    const badges = [
      {
        label: t('player_source_spotify_remote'),
        tone: 'source',
      },
      {
        label: t('agent_playback_full'),
        tone: 'ready',
      },
    ]

    if (!isConnected) {
      badges.push({
        label: t('spotify_playback_status_connect'),
        tone: 'warning',
      })
      return badges
    }

    if (spotifyErrorCode === 'spotify_premium_required') {
      badges.push({
        label: t('spotify_playback_status_premium'),
        tone: 'warning',
      })
      return badges
    }

    if (isConnecting) {
      badges.push({
        label: t('spotify_playback_status_connecting'),
        tone: 'subtle',
      })
      return badges
    }

    if (spotifyErrorCode === 'spotify_no_active_device' || !spotifyReady) {
      badges.push({
        label: t('spotify_playback_status_no_device'),
        tone: 'warning',
      })
      return badges
    }

    badges.push({
      label: t('spotify_playback_status_ready'),
      tone: 'subtle',
    })
    return badges
  }

  if (playback.playMode === TRACK_PLAY_MODES.PREVIEW) {
    return [
      {
        label: t('player_source_preview'),
        tone: 'subtle',
      },
      {
        label: t('agent_playback_preview'),
        tone: 'preview',
      },
    ]
  }

  return [
    {
      label: t('player_source_unavailable'),
      tone: 'warning',
    },
  ]
}

function FooterLeft() {
  const { t } = useTranslation()
  const { isConnected } = useSpotify()
  const {
    errorCode: spotifyErrorCode,
    isConnecting: spotifyConnecting,
    isReady: spotifyReady,
  } = useSpotifyPlayback()
  const trackData = useSelector((state) => state.player.trackData)
  const playback = resolveTrackPlaybackMeta(trackData)
  const badges = buildPlaybackBadges({
    playback,
    trackData,
    isConnected,
    isConnecting: spotifyConnecting,
    spotifyErrorCode,
    spotifyReady,
    t,
  })

  return (
    <div className={styles.footerLeft}>
      <div className={styles.imgBox}>
        <img src={trackData.trackImg} alt={trackData.trackName} />
      </div>
      <div className={styles.songDetails}>
        <TextRegularM>{trackData.trackName}</TextRegularM>
        <TextRegularM>
          <small>{trackData.trackArtist}</small>
        </TextRegularM>
        <div className={styles.BadgeRow}>
          {badges.map((badge) => (
            <span
              key={`${badge.tone}-${badge.label}`}
              className={`${styles.PlaybackBadge} ${styles[badge.tone]}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      </div>
      <IconButton icon={<Icons.Like />} activeicon={<Icons.LikeActive />} />
      <IconButton icon={<Icons.Corner />} activeicon={<Icons.Corner />} />
    </div>
  )
}

export default FooterLeft

import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import * as Icons from '../icons/index.jsx'
import TextRegularM from '../text/TextRegularM'
import IconButton from '../buttons/IconButton'
import { getTrackPlaybackStatusKey, resolveTrackPlaybackMeta } from '../../lib/spotify.js'
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

function FooterLeft() {
  const { t } = useTranslation()
  const { isConnected } = useSpotify()
  const trackData = useSelector((state) => state.player.trackData)
  const playback = resolveTrackPlaybackMeta(trackData)
  const isLocalAudio = playback.isLocalAudio
  const badges = isLocalAudio
    ? [
        t('player_source_local_audio'),
        t('agent_playback_full'),
        getLocalAudioFormatLabel(trackData),
      ]
    : [t(getTrackPlaybackStatusKey(trackData, { allowRemote: isConnected }))]

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
            <span key={badge} className={styles.PlaybackBadge}>
              {badge}
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

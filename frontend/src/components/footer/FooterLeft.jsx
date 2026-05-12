import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import * as Icons from '../icons/index.jsx'
import TextRegularM from '../text/TextRegularM'
import IconButton from '../buttons/IconButton'
import { getTrackPlaybackStatusKey } from '../../lib/spotify.js'
import styles from './footer-left.module.css'

function FooterLeft() {
  const { t } = useTranslation()
  const { isConnected } = useSpotify()
  const trackData = useSelector((state) => state.player.trackData)

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
        <span className={styles.PlaybackBadge}>
          {t(getTrackPlaybackStatusKey(trackData, { allowRemote: isConnected }))}
        </span>
      </div>
      <IconButton icon={<Icons.Like />} activeicon={<Icons.LikeActive />} />
      <IconButton icon={<Icons.Corner />} activeicon={<Icons.Corner />} />
    </div>
  )
}

export default FooterLeft

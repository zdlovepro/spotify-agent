import { useTranslation } from 'react-i18next'
import Topnav from '../components/topnav/Topnav'
import TitleL from '../components/text/TitleL'
import TitleM from '../components/text/TitleM'
import PlaylistCardS from '../components/cards/PlaylistCardS'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { useSpotify } from '../context/SpotifyContext.jsx'
import { PLAYLIST } from '../data/index.js'
import styles from './home.module.css'

function Home() {
  const { t } = useTranslation()
  const { isAuthenticated, playlists } = useSpotify()
  const homePlaylists = isAuthenticated ? playlists : PLAYLIST

  return (
    <div className={styles.Home}>
      <div className={styles.HoverBg} />
      <div className={styles.Bg} />

      <Topnav />
      <div className={styles.Content}>
        <section>
          <div className={styles.SectionTitle}>
            <TitleL>{t('welcome')}</TitleL>
          </div>

          <div className={styles.SectionCards}>
            {homePlaylists.map((item) => (
              <PlaylistCardS key={item.title} data={item} />
            ))}
          </div>
        </section>

        <section>
          <div className={styles.SectionTitle}>
            <TitleM>{t('recentlyPlayed')}</TitleM>
          </div>

          <div className={styles.SectionCardsMedium}>
            {homePlaylists.slice(0, 6).map((item) => (
              <PlaylistCardM key={item.title} data={item} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home

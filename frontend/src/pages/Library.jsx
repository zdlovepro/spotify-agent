import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TitleM from '../components/text/TitleM'
import Topnav from '../components/topnav/Topnav'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { PLAYLIST } from '../data/index.js'
import styles from './library.module.css'

function Library() {
  return (
    <div className={styles.LibPage}>
      <Topnav tabButtons={true} />
      <div className={styles.Library}>
        <Routes>
          <Route path="/" element={<PlaylistTab />} />
          <Route path="/podcasts" element={<PodcastTab />} />
          <Route path="/artists" element={<ArtistTab />} />
          <Route path="/albums" element={<AlbumTab />} />
        </Routes>
      </div>
    </div>
  )
}

function PlaylistTab() {
  const { t } = useTranslation()
  return (
    <div>
      <TitleM>{t('playlists')}</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'playlist').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

function PodcastTab() {
  const { t } = useTranslation()
  return (
    <div>
      <TitleM>{t('podcasts')}</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'podcast').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

function ArtistTab() {
  const { t } = useTranslation()
  return (
    <div>
      <TitleM>{t('artists')}</TitleM>
    </div>
  )
}

function AlbumTab() {
  const { t } = useTranslation()
  return (
    <div>
      <TitleM>{t('albums')}</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'albüm').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

export default Library

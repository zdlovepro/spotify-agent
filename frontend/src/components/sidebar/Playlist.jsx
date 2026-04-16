import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import TitleS from '../text/TitleS'
import TextRegularM from '../text/TextRegularM'
import PlaylistButton from './PlaylistButton'
import { PLAYLISTBTN } from '../../constants/index.jsx'
import { PLAYLIST } from '../../data/index.js'
import styles from './playlist.module.css'

function Playlist() {
  const { t } = useTranslation()
  const { isAuthenticated, playlists } = useSpotify()
  const libraryPlaylists = isAuthenticated
    ? playlists
    : PLAYLIST.filter((item) => item.type === 'playlist')

  return (
    <div className={styles.Playlist}>
      <TitleS>{t('playlists')}</TitleS>

      <div>
        {PLAYLISTBTN.map((playlist) => (
          <PlaylistButton
            href={playlist.path}
            ImgName={playlist.ImgName}
            key={playlist.title}
          >
            {t(playlist.titleKey)}
          </PlaylistButton>
        ))}
      </div>

      <hr className={styles.hr} />

      <div>
        {libraryPlaylists.map((list) => (
          <Link to={`/playlist/${list.link}`} key={list.title}>
            <TextRegularM>{list.title}</TextRegularM>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Playlist

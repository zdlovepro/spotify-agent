import { Link } from 'react-router-dom'
import TitleS from '../text/TitleS'
import TextRegularM from '../text/TextRegularM'
import PlaylistButton from './PlaylistButton'
import { PLAYLISTBTN } from '../../constants/index.jsx'
import { PLAYLIST } from '../../data/index.js'
import styles from './playlist.module.css'

function Playlist() {
  return (
    <div className={styles.Playlist}>
      <TitleS>Playlists</TitleS>

      <div>
        {PLAYLISTBTN.map((playlist) => (
          <PlaylistButton
            href={playlist.path}
            ImgName={playlist.ImgName}
            key={playlist.title}
          >
            {playlist.title}
          </PlaylistButton>
        ))}
      </div>

      <hr className={styles.hr} />

      <div>
        {PLAYLIST.filter((item) => item.type === 'playlist').map((list) => (
          <Link to={`/playlist/${list.link}`} key={list.title}>
            <TextRegularM>{list.title}</TextRegularM>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Playlist

import { Routes, Route } from 'react-router-dom'
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
  return (
    <div>
      <TitleM>Playlists</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'playlist').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

function PodcastTab() {
  return (
    <div>
      <TitleM>Podcasts</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'podcast').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

function ArtistTab() {
  return (
    <div>
      <TitleM>Artists</TitleM>
    </div>
  )
}

function AlbumTab() {
  return (
    <div>
      <TitleM>Albums</TitleM>
      <div className={styles.Grid}>
        {PLAYLIST.filter((item) => item.type === 'albüm').map((item) => (
          <PlaylistCardM key={item.title} data={item} />
        ))}
      </div>
    </div>
  )
}

export default Library

import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changePlay } from '../../store/index.js'
import TextBoldL from '../text/TextBoldL'
import TextRegularM from '../text/TextRegularM'
import Playgif from '../../assets/images/now-play.gif'
import * as Icons from '../icons/index.jsx'
import styles from './playlist-track.module.css'

function PlaylistTrack({ data }) {
  const dispatch = useDispatch()
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const trackData = useSelector((state) => state.player.trackData)
  const [thisSong, setThisSong] = useState(false)
  const playable = data.song.playable ?? Boolean(data.song.link)
  const isAlbumView = data.listType === 'album' || data.listType === 'alb眉m'

  useEffect(() => {
    setThisSong(
      (data.song.id === trackData.id || data.song.link === trackData.track) &&
        isPlaying === true,
    )
  }, [data.song.id, data.song.link, trackData.id, trackData.track, isPlaying])

  return (
    <div
      className={`${styles.trackDiv} ${thisSong ? 'activeTrack' : ''} ${!playable ? styles.DisabledTrack : ''}`}
      style={isAlbumView ? { gridTemplateColumns: '16px 1fr 38px' } : {}}
    >
      <button
        className={styles.playBtn}
        disabled={!playable}
        onClick={() => dispatch(changePlay(thisSong ? !isPlaying : true))}
      >
        {thisSong ? <Icons.Pause /> : <Icons.Play />}
      </button>

      {thisSong ? (
        <img className={styles.gif} src={Playgif} alt="now playing" />
      ) : (
        <p className={styles.SongIndex}>{data.song.index}</p>
      )}

      {!isAlbumView && <img src={data.song.songimg} alt={data.song.songName} />}

      <span>
        <TextBoldL>{data.song.songName}</TextBoldL>
        <TextRegularM>{data.song.songArtist}</TextRegularM>
      </span>

      <p>{data.song.trackTime}</p>
    </div>
  )
}

export default PlaylistTrack

import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { changePlay, changeTrack } from '../../store/index.js'
import { createPlaybackQueue } from '../../lib/spotify.js'
import TextBoldL from '../text/TextBoldL'
import PlayButton from '../buttons/PlayButton'
import styles from './playlist-card-s.module.css'

function PlaylistCardS({ data }) {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [isthisplay, setIsthisPlay] = useState(false)
  const canPlay = (data.playlistData || []).some((song) => song.link)

  function changeTheme() {
    document.documentElement.style.setProperty('--hover-home-bg', data.hoverColor)
  }

  function handlePlay(event) {
    event.preventDefault()
    event.stopPropagation()

    if (!canPlay) {
      return
    }

    if (trackData.playlistId === data.link) {
      dispatch(changePlay(!isPlaying))
      return
    }

    dispatch(changeTrack({ queue: createPlaybackQueue(data), startIndex: 0 }))
    dispatch(changePlay(true))
  }

  useEffect(() => {
    setIsthisPlay(trackData.playlistId === data.link)
  }, [data.link, trackData.playlistId])

  return (
    <div className={styles.PlaylistCardSBox}>
      <Link to={`/playlist/${data.link}`} onMouseOver={changeTheme}>
        <div className={styles.PlaylistCardS}>
          <div className={styles.ImgBox}>
            <img src={data.imgUrl} alt={data.title} />
          </div>
          <div className={styles.Title}>
            <TextBoldL>{data.title}</TextBoldL>
          </div>
        </div>
      </Link>
      {canPlay && (
        <div
          onClick={handlePlay}
          className={`${styles.IconBox} ${isthisplay && isPlaying ? styles.ActiveIconBox : ''}`}
        >
          <PlayButton isthisplay={isthisplay} onClick={handlePlay} />
        </div>
      )}
    </div>
  )
}

export default PlaylistCardS

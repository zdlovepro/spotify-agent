import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changeTrack } from '../../store/index.js'
import { Link } from 'react-router-dom'
import TextBoldL from '../text/TextBoldL'
import PlayButton from '../buttons/PlayButton'
import styles from './playlist-card-s.module.css'

function PlaylistCardS({ data }) {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [isthisplay, setIsthisPlay] = useState(false)

  function changeTheme() {
    document.documentElement.style.setProperty('--hover-home-bg', data.hoverColor)
  }

  useEffect(() => {
    setIsthisPlay(parseInt(data.index) === trackData.trackKey[0])
  }, [data.index, trackData.trackKey])

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
      <div
        onClick={() => dispatch(changeTrack([parseInt(data.index), 0]))}
        className={`${styles.IconBox} ${isthisplay && isPlaying ? styles.ActiveIconBox : ''}`}
      >
        <PlayButton isthisplay={isthisplay} />
      </div>
    </div>
  )
}

export default PlaylistCardS

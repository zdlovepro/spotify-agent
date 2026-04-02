import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { changeTrack } from '../../store/index.js'
import { Link } from 'react-router-dom'
import TextBoldL from '../text/TextBoldL'
import TextRegularM from '../text/TextRegularM'
import PlayButton from '../buttons/PlayButton'
import styles from './playlist-card-m.module.css'

function PlaylistCardM({ data }) {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [isthisplay, setIsthisPlay] = useState(false)

  useEffect(() => {
    setIsthisPlay(parseInt(data.index) === trackData.trackKey[0])
  }, [data.index, trackData.trackKey])

  return (
    <div className={styles.PlaylistCardSBox}>
      <Link to={`/playlist/${data.link}`}>
        <div className={styles.PlaylistCardS}>
          <div className={styles.ImgBox}>
            <img src={data.imgUrl} alt={data.title} />
          </div>
          <div className={styles.Title}>
            <TextBoldL>{data.title}</TextBoldL>
            <TextRegularM>{data.artist}</TextRegularM>
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

export default PlaylistCardM

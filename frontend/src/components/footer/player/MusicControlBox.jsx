import { useSelector, useDispatch } from 'react-redux'
import { changePlay, nextTrack, previousTrack } from '../../../store/index.js'
import * as Icons from '../../icons/index.jsx'
import IconButton from '../../buttons/IconButton'
import PlayButton from '../../buttons/PlayButton'
import styles from './music-control-box.module.css'

function MusicControlBox() {
  const dispatch = useDispatch()
  const isPlaying = useSelector((state) => state.player.isPlaying)

  function togglePlay() {
    dispatch(changePlay(!isPlaying))
  }

  return (
    <div className={styles.musicControl}>
      <IconButton icon={<Icons.Mix />} activeicon={<Icons.Mix />} />
      <button className={styles.button} onClick={() => dispatch(previousTrack())}>
        <Icons.Prev />
      </button>
      <PlayButton isthisplay={true} onClick={togglePlay} />
      <button className={styles.button} onClick={() => dispatch(nextTrack())}>
        <Icons.Next />
      </button>
      <IconButton icon={<Icons.Loop />} activeicon={<Icons.Loop />} />
    </div>
  )
}

export default MusicControlBox

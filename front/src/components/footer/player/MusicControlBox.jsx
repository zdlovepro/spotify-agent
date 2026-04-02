import { useSelector, useDispatch } from 'react-redux'
import { changeTrack } from '../../../store/index.js'
import * as Icons from '../../icons/index.jsx'
import IconButton from '../../buttons/IconButton'
import PlayButton from '../../buttons/PlayButton'
import { PLAYLIST } from '../../../data/index.js'
import styles from './music-control-box.module.css'

function MusicControlBox() {
  const dispatch = useDispatch()
  const trackData = useSelector((state) => state.player.trackData)

  function decreaseIndex() {
    const [pIdx, tIdx] = trackData.trackKey
    if (tIdx > 0) {
      dispatch(changeTrack([pIdx, tIdx - 1]))
    }
  }

  function increaseIndex() {
    const [pIdx, tIdx] = trackData.trackKey
    if (tIdx < PLAYLIST[pIdx].playlistData.length - 1) {
      dispatch(changeTrack([pIdx, tIdx + 1]))
    }
  }

  return (
    <div className={styles.musicControl}>
      <IconButton icon={<Icons.Mix />} activeicon={<Icons.Mix />} />
      <button className={styles.button} onClick={decreaseIndex}>
        <Icons.Prev />
      </button>
      <PlayButton isthisplay={true} />
      <button className={styles.button} onClick={increaseIndex}>
        <Icons.Next />
      </button>
      <IconButton icon={<Icons.Loop />} activeicon={<Icons.Loop />} />
    </div>
  )
}

export default MusicControlBox

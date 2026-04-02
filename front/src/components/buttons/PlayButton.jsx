import { useSelector, useDispatch } from 'react-redux'
import { changePlay } from '../../store/index.js'
import * as Icons from '../icons/index.jsx'
import IconButton from './IconButton'
import styles from './play-button.module.css'

function PlayButton({ isthisplay }) {
  const dispatch = useDispatch()
  const isPlaying = useSelector((state) => state.player.isPlaying)

  return (
    <div
      className={styles.playBtn}
      tabIndex="0"
      role="button"
      onClick={() => dispatch(changePlay(!isPlaying))}
    >
      {isPlaying && isthisplay ? (
        <IconButton icon={<Icons.Pause />} activeicon={<Icons.Pause />} />
      ) : (
        <IconButton icon={<Icons.Play />} activeicon={<Icons.Play />} />
      )}
    </div>
  )
}

export default PlayButton

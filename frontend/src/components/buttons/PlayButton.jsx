import { useSelector } from 'react-redux'
import * as Icons from '../icons/index.jsx'
import styles from './play-button.module.css'

function PlayButton({ isthisplay, onClick, disabled = false, title = '' }) {
  const isPlaying = useSelector((state) => state.player.isPlaying)

  return (
    <button
      type="button"
      className={styles.playBtn}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {isPlaying && isthisplay ? (
        <Icons.Pause />
      ) : (
        <Icons.Play />
      )}
    </button>
  )
}

export default PlayButton

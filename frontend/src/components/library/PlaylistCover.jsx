import defaultPlaylistCover from '../../assets/default-playlist-cover.png'
import styles from './playlist-cover.module.css'
import { getPlaylistCoverUrl } from '../../utils/library.js'

function PlaylistCover({
  playlist = null,
  imageUrl = '',
  title = '',
  shape = 'square',
  className = '',
}) {
  const coverUrl = imageUrl || getPlaylistCoverUrl(playlist || {}) || defaultPlaylistCover
  const label =
    title || playlist?.title || playlist?.name || 'Playlist cover'
  const shapeClass = shape === 'circle' ? styles.Circle : styles.Square
  const rootClassName = `${styles.Cover} ${shapeClass} ${className}`.trim()

  return (
    <img
      className={`${rootClassName} ${coverUrl === defaultPlaylistCover ? styles.Fallback : ''}`.trim()}
      src={coverUrl}
      alt={label}
    />
  )
}

export default PlaylistCover

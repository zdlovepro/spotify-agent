import { useState, useEffect } from 'react'
import useWindowSize from '../../hooks/useWindowSize'
import useMousePosition from '../../hooks/useMousePosition'
import Playlist from './Playlist'
import styles from './sidebar.module.css'

function Sidebar() {
  const size = useWindowSize()
  const minWidth = 280
  const maxWidth = Math.max(minWidth, Math.min(420, Math.floor(size.width * 0.34)))
  const [width, setWidth] = useState(328)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const { x } = useMousePosition()

  useEffect(() => {
    setWidth((currentWidth) =>
      Math.min(Math.max(currentWidth, minWidth), maxWidth),
    )
  }, [maxWidth])

  useEffect(() => {
    if (!isMouseDown) return

    const handleMove = () => {
      if (x > minWidth && x < maxWidth) {
        setWidth(x)
      }
    }

    const handleUp = () => {
      setIsMouseDown(false)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
      return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [isMouseDown, maxWidth, minWidth, x])

  return (
    <nav
      className={styles.SideNavbar}
      style={{ width: `${Math.min(width, maxWidth)}px` }}
    >
      <div className={styles.Fixed}>
        <section className={styles.LibrarySection}>
          <Playlist />
        </section>
      </div>
      <div
        className={`${styles.changeWidth} ${isMouseDown ? styles.ActiveChange : ''}`}
        onMouseDown={() => setIsMouseDown(true)}
      />
    </nav>
  )
}

export default Sidebar

import { useState } from 'react'
import styles from './icon-button.module.css'

function IconButton({ icon, activeicon }) {
  const [isActive, setIsActive] = useState(false)

  return (
    <button
      className={`${styles.iconButton} ${isActive ? 'activeIcon' : ''}`}
      onClick={() => setIsActive((prev) => !prev)}
    >
      {isActive ? activeicon : icon}
    </button>
  )
}

export default IconButton

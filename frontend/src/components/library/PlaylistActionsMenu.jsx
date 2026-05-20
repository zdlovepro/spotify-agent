import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../icons/index.jsx'
import styles from './playlist-actions-menu.module.css'

function PlaylistActionsMenu({
  className = '',
  onRename = null,
  onDelete = null,
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return
      }

      setIsOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!onRename && !onDelete) {
    return null
  }

  return (
    <div className={`${styles.MenuRoot} ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className={styles.Trigger}
        aria-label={t('library_action_more')}
        title={t('library_action_more')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setIsOpen((currentValue) => !currentValue)
        }}
      >
        <Icons.More />
      </button>

      {isOpen && (
        <div className={styles.Menu} role="menu">
          {onRename && (
            <button
              type="button"
              className={styles.Item}
              role="menuitem"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setIsOpen(false)
                onRename()
              }}
            >
              {t('playlist_action_rename')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={`${styles.Item} ${styles.Danger}`}
              role="menuitem"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setIsOpen(false)
                onDelete()
              }}
            >
              {t('playlist_action_delete')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default PlaylistActionsMenu

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { useAuth } from '../../context/AuthContext.jsx'
import { PLAYLISTBTN } from '../../constants/index.jsx'
import { mapLocalPlaylistSummary } from '../../utils/library.js'
import * as Icons from '../icons/index.jsx'
import styles from './playlist.module.css'

function normalizeType(item) {
  const rawType = String(item.type || 'playlist').toLowerCase()

  if (rawType.includes('album') || rawType.includes('alb')) {
    return 'album'
  }

  if (rawType.includes('artist')) {
    return 'artist'
  }

  if (rawType.includes('podcast')) {
    return 'podcast'
  }

  return 'playlist'
}

function getItemImage(item) {
  return item.imgUrl || item.cover || item.playlistData?.[0]?.songimg || ''
}

function getTypeLabel(item, t) {
  switch (normalizeType(item)) {
    case 'album':
      return t('search_result_album')
    case 'artist':
      return t('search_result_artist')
    case 'podcast':
      return t('podcasts')
    default:
      return t('search_result_playlist')
  }
}

function Playlist() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isAuthenticated, openAuthDialog, request } = useAuth()
  const activePlaylistId = useSelector((state) => state.player.trackData.playlistId)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('playlist')
  const [sortMode, setSortMode] = useState('recent')
  const [playlists, setPlaylists] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadLibrary() {
      if (!isAuthenticated) {
        setPlaylists([])
        setError('')
        return
      }

      try {
        const data = await request('/api/library/playlists')

        if (cancelled) {
          return
        }

        setPlaylists((data.items || []).map(mapLocalPlaylistSummary))
        setError('')
      } catch (requestError) {
        if (!cancelled) {
          setPlaylists([])
          setError(requestError.message)
        }
      }
    }

    loadLibrary()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, request])

  const libraryItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const filteredItems = playlists.filter((item) => {
      const itemType = normalizeType(item)

      if (filter !== 'all' && itemType !== filter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const searchText = `${item.title || ''} ${item.artist || ''} ${item.description || ''}`
        .toLowerCase()
        .trim()

      return searchText.includes(normalizedQuery)
    })

    if (sortMode === 'title') {
      return [...filteredItems].sort((left, right) =>
        String(left.title || '').localeCompare(String(right.title || '')),
      )
    }

    return filteredItems
  }, [filter, playlists, query, sortMode])

  const filterItems = [
    { key: 'playlist', label: t('library_filter_playlists') },
    { key: 'album', label: t('library_filter_albums') },
  ]

  async function handleCreatePlaylist() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    try {
      const data = await request('/api/library/playlists', {
        method: 'POST',
        body: {
          title: t('library_new_playlist'),
        },
      })
      const nextPlaylist = data?.playlist
        ? mapLocalPlaylistSummary(data.playlist)
        : null

      if (!nextPlaylist) {
        return
      }

      setPlaylists((currentPlaylists) => [nextPlaylist, ...currentPlaylists])
      navigate(`/playlist/${nextPlaylist.link}`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function handleOpenLibrary() {
    navigate('/library')
  }

  return (
    <div className={styles.Playlist}>
      <header className={styles.Header}>
        <button type="button" className={styles.LibraryTitle}>
          <span>{t('nav_yourLibrary')}</span>
        </button>

        <div className={styles.HeaderActions}>
          <button
            type="button"
            className={styles.IconAction}
            aria-label={t('library_action_create')}
            title={t('library_action_create')}
            onClick={handleCreatePlaylist}
          >
            +
          </button>
          <button
            type="button"
            className={styles.IconAction}
            aria-label={t('library_action_open')}
            title={t('library_action_open')}
            onClick={handleOpenLibrary}
          >
            ↗
          </button>
        </div>
      </header>

      <div className={styles.FilterRow}>
        {filterItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${styles.FilterChip} ${filter === item.key ? styles.ActiveChip : ''}`}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className={styles.UtilityRow}>
        <label className={styles.SearchField}>
          <Icons.Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('library_search_placeholder')}
            type="search"
          />
        </label>

        <button
          type="button"
          className={styles.SortButton}
          onClick={() =>
            setSortMode((currentMode) =>
              currentMode === 'recent' ? 'title' : 'recent',
            )
          }
        >
          {sortMode === 'recent'
            ? t('library_sort_recent')
            : t('library_sort_title')}
        </button>
      </div>

      {!isAuthenticated && (
        <div className={styles.Shortcuts}>
          {PLAYLISTBTN.map((item) => (
            <div key={item.title} className={styles.ShortcutCard}>
              <span>{t(item.titleKey)}</span>
            </div>
          ))}
          <button
            type="button"
            className={styles.AuthCta}
            onClick={() => openAuthDialog('login')}
          >
            {t('library_sign_in_cta')}
          </button>
        </div>
      )}

      <div className={styles.List}>
        {error && (
          <div className={styles.EmptyState}>
            <p>{t('library_error_title')}</p>
            <span>{error}</span>
          </div>
        )}

        {libraryItems.map((list) => {
          const isActive = activePlaylistId === list.link
          const image = getItemImage(list)

          return (
            <Link
              to={`/playlist/${list.link}`}
              key={list.link || list.title}
              className={`${styles.LibraryItem} ${isActive ? styles.ActiveItem : ''}`}
            >
              <div
                className={styles.Cover}
                style={{
                  backgroundColor: list.playlistBg || list.hoverColor || '#303030',
                }}
              >
                {image ? <img src={image} alt={list.title} /> : <span>♪</span>}
              </div>

              <div className={styles.LibraryItemCopy}>
                <p className={styles.ItemTitle}>{list.title}</p>
                <p className={styles.ItemMeta}>
                  {getTypeLabel(list, t)}
                  {list.artist ? ` · ${list.artist}` : ''}
                </p>
              </div>

              {isActive && <span className={styles.PlayingDot} />}
            </Link>
          )
        })}

        {!error && libraryItems.length === 0 && (
          <div className={styles.EmptyState}>
            <p>{isAuthenticated ? t('library_empty') : t('library_guest_title')}</p>
            <span>
              {isAuthenticated ? t('library_empty_hint') : t('library_guest_body')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default Playlist

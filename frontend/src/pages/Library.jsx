import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TitleM from '../components/text/TitleM'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { useAuth } from '../context/AuthContext.jsx'
import { mapLocalPlaylistSummary } from '../utils/library.js'
import styles from './library.module.css'

function Library() {
  const { isAuthenticated, openAuthDialog, request } = useAuth()
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
          setError(requestError.message)
          setPlaylists([])
        }
      }
    }

    loadLibrary()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, request])

  return (
    <div className={styles.LibPage}>
      <div className={styles.Library}>
        {!isAuthenticated && (
          <section className={styles.EmptyState}>
            <TitleM>{t('library_guest_title')}</TitleM>
            <p className={styles.EmptyText}>{t('library_guest_body')}</p>
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={() => openAuthDialog('login')}
            >
              {t('library_sign_in_cta')}
            </button>
          </section>
        )}

        {isAuthenticated && error && (
          <section className={styles.EmptyState}>
            <TitleM>{t('library_error_title')}</TitleM>
            <p className={styles.EmptyText}>{error}</p>
          </section>
        )}

        {isAuthenticated && !error && (
          <Routes>
            <Route path="/" element={<PlaylistTab playlists={playlists} />} />
            <Route
              path="/podcasts"
              element={<PlaceholderTab translationKey="podcasts" />}
            />
            <Route
              path="/artists"
              element={<PlaceholderTab translationKey="artists" />}
            />
            <Route
              path="/albums"
              element={<PlaceholderTab translationKey="albums" />}
            />
          </Routes>
        )}
      </div>
    </div>
  )
}

function PlaylistTab({ playlists }) {
  const { t } = useTranslation()

  return (
    <div>
      <TitleM>{t('playlists')}</TitleM>
      <div className={styles.Grid}>
        {playlists.length ? (
          playlists.map((item) => <PlaylistCardM key={item.link} data={item} />)
        ) : (
          <p className={styles.EmptyText}>{t('library_empty')}</p>
        )}
      </div>
    </div>
  )
}

function PlaceholderTab({ translationKey }) {
  const { t } = useTranslation()

  return (
    <div>
      <TitleM>{t(translationKey)}</TitleM>
      <p className={styles.EmptyText}>{t('library_placeholder_body')}</p>
    </div>
  )
}

export default Library

import { useEffect, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import TitleM from '../components/text/TitleM'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { useAuth } from '../context/AuthContext.jsx'
import { startAgentPlayback } from '../store/index.js'
import { mapLocalPlaylistSummary } from '../utils/library.js'
import {
  createLocalAudioTrack,
  mapLocalAudioCard,
} from '../utils/media.js'
import styles from './library.module.css'

function readAudioDurationMs(file) {
  return new Promise((resolve) => {
    const audio = document.createElement('audio')
    const objectUrl = URL.createObjectURL(file)

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl)
      audio.removeAttribute('src')
    }

    audio.preload = 'metadata'
    audio.src = objectUrl

    audio.onloadedmetadata = () => {
      const durationSeconds = Number(audio.duration) || 0
      cleanup()
      resolve(durationSeconds > 0 ? Math.round(durationSeconds * 1000) : null)
    }

    audio.onerror = () => {
      cleanup()
      resolve(null)
    }
  })
}

function Library() {
  const { t } = useTranslation()
  const dispatch = useDispatch()
  const { isAuthenticated, openAuthDialog, request, session } = useAuth()
  const fileInputRef = useRef(null)
  const [playlists, setPlaylists] = useState([])
  const [audioAssets, setAudioAssets] = useState([])
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadLibrary() {
      if (!isAuthenticated) {
        setPlaylists([])
        setAudioAssets([])
        setError('')
        return
      }

      try {
        const [playlistData, audioData] = await Promise.all([
          request('/api/library/playlists'),
          request('/api/media/assets'),
        ])

        if (cancelled) {
          return
        }

        setPlaylists((playlistData.items || []).map(mapLocalPlaylistSummary))
        setAudioAssets(audioData.items || [])
        setError('')
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message)
          setPlaylists([])
          setAudioAssets([])
        }
      }
    }

    loadLibrary()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, request])

  async function handleFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name.replace(/\.(m4a|mp3)$/i, ''))
    const durationMs = await readAudioDurationMs(file)

    if (durationMs) {
      formData.append('duration_ms', String(durationMs))
    }

    setIsUploading(true)

    try {
      const data = await request('/api/media/upload', {
        method: 'POST',
        body: formData,
      })

      setAudioAssets((currentAssets) => [data.asset, ...currentAssets])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  function handleUploadClick() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    fileInputRef.current?.click()
  }

  function handlePlayAsset(asset) {
    dispatch(
      startAgentPlayback({
        tracks: [createLocalAudioTrack(asset, session?.token || '')],
        playlistId: `local-audio-${asset.id}`,
        playlistTitle: asset.title || asset.originalFilename || 'Local audio',
      }),
    )
  }

  async function handleDeleteAsset(assetId) {
    try {
      await request(`/api/media/assets/${assetId}`, {
        method: 'DELETE',
      })
      setAudioAssets((currentAssets) =>
        currentAssets.filter((asset) => asset.id !== assetId),
      )
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className={styles.LibPage}>
      <div className={styles.Library}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".m4a,.mp3,audio/mp4,audio/x-m4a,audio/mpeg,audio/mp3"
          className={styles.HiddenInput}
          onChange={handleFileChange}
        />

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
            <Route
              path="/"
              element={
                <PlaylistTab
                  playlists={playlists}
                  audioAssets={audioAssets}
                  isUploading={isUploading}
                  onDeleteAsset={handleDeleteAsset}
                  onPlayAsset={handlePlayAsset}
                  onUploadClick={handleUploadClick}
                />
              }
            />
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

function PlaylistTab({
  playlists,
  audioAssets,
  isUploading,
  onDeleteAsset,
  onPlayAsset,
  onUploadClick,
}) {
  const { t } = useTranslation()
  const localPlaylists = playlists.filter(
    (playlist) => playlist.sourceLabel !== 'spotify_import',
  )

  return (
    <div className={styles.LibrarySections}>
      <div className={styles.SectionHeader}>
        <TitleM>{t('playlists')}</TitleM>
      </div>

      <section className={styles.SectionBlock}>
        <div className={styles.SectionHeader}>
          <TitleM>{t('library_local_playlists_section')}</TitleM>
          <p className={styles.SectionHint}>{t('library_local_playlists_hint')}</p>
        </div>

        <div className={styles.Grid}>
          {localPlaylists.length ? (
            localPlaylists.map((item) => (
              <PlaylistCardM key={item.link} data={item} />
            ))
          ) : (
            <div className={styles.EmptyState}>
              <p className={styles.EmptyText}>{t('library_empty')}</p>
              <p className={styles.SectionHint}>{t('library_empty_hint')}</p>
            </div>
          )}
        </div>
      </section>

      <section className={styles.AssetSection}>
        <div className={styles.SectionHeader}>
          <div className={styles.SectionCopy}>
            <TitleM>{t('library_audio_section')}</TitleM>
            <p className={styles.SectionHint}>{t('library_audio_hint')}</p>
          </div>
          <div className={styles.SectionActions}>
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={onUploadClick}
              disabled={isUploading}
            >
              {isUploading ? t('library_uploading') : t('library_upload_audio')}
            </button>
            <p className={styles.UploadMeta}>{t('library_upload_support')}</p>
          </div>
        </div>

        {audioAssets.length ? (
          <div className={styles.AssetGrid}>
            {audioAssets.map((asset) => {
              const card = mapLocalAudioCard(asset)

              return (
                <article key={asset.id} className={styles.AssetCard}>
                  <img
                    src={card.imageUrl}
                    alt={card.title}
                    className={styles.AssetImage}
                  />
                  <div className={styles.AssetCopy}>
                    <div className={styles.AssetTitleRow}>
                      <h3 className={styles.AssetTitle}>{card.title}</h3>
                      <span className={styles.FormatBadge}>
                        {card.formatLabel}
                      </span>
                    </div>
                    <p className={styles.AssetMeta}>
                      {card.filenameText || card.artistText}
                    </p>
                    <p className={styles.AssetMeta}>
                      {card.durationText} | {card.sizeText}
                    </p>
                  </div>
                  <div className={styles.AssetActions}>
                    <button
                      type="button"
                      className={styles.PrimaryBtn}
                      onClick={() => onPlayAsset(asset)}
                    >
                      {t('library_audio_play')}
                    </button>
                    <button
                      type="button"
                      className={styles.SecondaryBtn}
                      onClick={() => onDeleteAsset(asset.id)}
                    >
                      {t('library_audio_delete')}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className={styles.EmptyState}>
            <p className={styles.EmptyText}>{t('library_audio_empty')}</p>
            <p className={styles.SectionHint}>{t('library_audio_hint')}</p>
          </div>
        )}
      </section>
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

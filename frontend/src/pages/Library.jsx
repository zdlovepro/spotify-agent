import { useEffect, useRef, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import TitleM from '../components/text/TitleM'
import PlaylistCardM from '../components/cards/PlaylistCardM'
import { useAuth } from '../context/AuthContext.jsx'
import { useSpotify } from '../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../context/SpotifyPlaybackContext.jsx'
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
  const { connect, isConnected } = useSpotify()
  const fileInputRef = useRef(null)
  const [playlists, setPlaylists] = useState([])
  const [audioAssets, setAudioAssets] = useState([])
  const [error, setError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isImportingSpotify, setIsImportingSpotify] = useState(false)
  const [isSyncingSavedTracks, setIsSyncingSavedTracks] = useState(false)
  const [notice, setNotice] = useState('')

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
        setNotice('')
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
      setNotice('')
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
      setNotice('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function reloadPlaylistsOnly() {
    const playlistData = await request('/api/library/playlists')
    setPlaylists((playlistData.items || []).map(mapLocalPlaylistSummary))
  }

  async function handleImportSpotifyPlaylists() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    if (!isConnected) {
      connect('/library')
      return
    }

    setIsImportingSpotify(true)

    try {
      const data = await request('/api/providers/spotify/import/playlists', {
        method: 'POST',
      })
      await reloadPlaylistsOnly()
      setError('')
      setNotice(
        t('library_spotify_import_success', {
          count: data.importedCount || 0,
        }),
      )
    } catch (requestError) {
      setError(requestError.message)
      setNotice('')
    } finally {
      setIsImportingSpotify(false)
    }
  }

  async function handleSyncSavedTracks() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    if (!isConnected) {
      connect('/library')
      return
    }

    setIsSyncingSavedTracks(true)

    try {
      const data = await request('/api/providers/spotify/sync/saved-tracks', {
        method: 'POST',
      })
      await reloadPlaylistsOnly()
      setError('')
      setNotice(
        t('library_spotify_saved_tracks_success', {
          count: data.importedCount || 0,
        }),
      )
    } catch (requestError) {
      setError(requestError.message)
      setNotice('')
    } finally {
      setIsSyncingSavedTracks(false)
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
                  isConnected={isConnected}
                  isImportingSpotify={isImportingSpotify}
                  isSyncingSavedTracks={isSyncingSavedTracks}
                  isUploading={isUploading}
                  notice={notice}
                  onDeleteAsset={handleDeleteAsset}
                  onImportSpotifyPlaylists={handleImportSpotifyPlaylists}
                  onPlayAsset={handlePlayAsset}
                  onSyncSavedTracks={handleSyncSavedTracks}
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
  isConnected,
  isImportingSpotify,
  isSyncingSavedTracks,
  isUploading,
  notice,
  onDeleteAsset,
  onImportSpotifyPlaylists,
  onPlayAsset,
  onSyncSavedTracks,
  onUploadClick,
}) {
  const { t } = useTranslation()
  const {
    activatePlayer,
    error: spotifyPlaybackError,
    errorCode: spotifyPlaybackErrorCode,
    isConnecting: isSpotifyPlayerConnecting,
    isReady: isSpotifyPlayerReady,
  } = useSpotifyPlayback()
  const localPlaylists = playlists.filter(
    (playlist) => playlist.sourceLabel !== 'spotify_import',
  )
  const spotifyImportedPlaylists = playlists.filter(
    (playlist) => playlist.sourceLabel === 'spotify_import',
  )

  async function handleActivatePlayer() {
    await activatePlayer().catch(() => {})
  }

  const spotifySectionHint = !isConnected
    ? t('library_spotify_playlists_connect_hint')
    : spotifyPlaybackErrorCode === 'spotify_premium_required'
      ? t('spotify_playback_status_premium')
      : spotifyPlaybackErrorCode === 'spotify_no_active_device'
        ? t('spotify_playback_status_no_device')
        : isSpotifyPlayerConnecting
          ? t('spotify_playback_status_connecting')
          : isSpotifyPlayerReady
            ? t('library_spotify_playlists_ready_hint')
            : t('library_spotify_playlists_activate_hint')

  return (
    <div className={styles.LibrarySections}>
      <div className={styles.SectionHeader}>
        <TitleM>{t('playlists')}</TitleM>
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

      <section className={styles.SectionBlock}>
        <div className={styles.SectionLead}>
          <div className={styles.SectionHeader}>
            <TitleM>{t('library_spotify_playlists_section')}</TitleM>
            {isConnected &&
              !isSpotifyPlayerReady &&
              !isSpotifyPlayerConnecting &&
              spotifyPlaybackErrorCode !== 'spotify_premium_required' && (
                <button
                  type="button"
                  className={styles.SecondaryBtn}
                  onClick={handleActivatePlayer}
                >
                  {t('spotify_playback_activate')}
                </button>
              )}
          </div>
          <p className={styles.SectionHint}>{spotifySectionHint}</p>
          {spotifyPlaybackError && (
            <div className={styles.NoticeCard}>
              <p className={styles.NoticeText}>{spotifyPlaybackError}</p>
            </div>
          )}
        </div>

        <div className={styles.ImportBar}>
          <button
            type="button"
            className={styles.SecondaryBtn}
            onClick={onImportSpotifyPlaylists}
            disabled={isImportingSpotify}
          >
            {isConnected
              ? isImportingSpotify
                ? t('library_spotify_importing')
                : t('library_spotify_import_playlists')
              : t('library_spotify_connect_to_import')}
          </button>
          <button
            type="button"
            className={styles.SecondaryBtn}
            onClick={onSyncSavedTracks}
            disabled={isSyncingSavedTracks}
          >
            {isConnected
              ? isSyncingSavedTracks
                ? t('library_spotify_syncing_saved_tracks')
                : t('library_spotify_sync_saved_tracks')
              : t('library_spotify_connect_to_sync')}
          </button>
        </div>

        {notice && (
          <div className={styles.NoticeCard}>
            <p className={styles.NoticeText}>{notice}</p>
          </div>
        )}

        <div className={styles.Grid}>
          {spotifyImportedPlaylists.length ? (
            spotifyImportedPlaylists.map((item) => (
              <PlaylistCardM
                key={item.link}
                data={item}
                showDisabledPlayButton={!isConnected}
                disabledPlayTitle={t('spotify_playback_status_connect')}
              />
            ))
          ) : (
            <div className={styles.EmptyState}>
              <p className={styles.EmptyText}>
                {t('library_spotify_playlists_empty')}
              </p>
              <p className={styles.SectionHint}>
                {t('library_spotify_playlists_empty_hint')}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className={styles.AssetSection}>
        <div className={styles.SectionHeader}>
          <TitleM>{t('library_audio_section')}</TitleM>
          <p className={styles.SectionHint}>{t('library_audio_hint')}</p>
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

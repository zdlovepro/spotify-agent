import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import SearchPageCard from '../components/cards/SearchPageCard'
import SearchEmptyState from '../components/search/SearchEmptyState.jsx'
import SearchHeader from '../components/search/SearchHeader.jsx'
import SearchResultList from '../components/search/SearchResultList.jsx'
import SearchSkeleton from '../components/search/SearchSkeleton.jsx'
import SearchTopResult from '../components/search/SearchTopResult.jsx'
import {
  buildAllSections,
  getArtistNames,
  getItemImage,
  getResultCount,
  getTabItems,
  getTopResult,
  getTrackUri,
  normalizeSearchResults,
  resolveTrackActionState,
} from '../components/search/search-utils.js'
import { SEARCHCARDS } from '../data/index.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useSpotify } from '../context/SpotifyContext.jsx'
import { useSpotifyPlayback } from '../context/SpotifyPlaybackContext.jsx'
import { TRACK_PLAY_MODES } from '../lib/spotify.js'
import { startAgentPlayback } from '../store/index.js'
import {
  emitLibraryPlaylistsUpdated,
  subscribeLibraryPlaylistsUpdated,
} from '../utils/library-events.js'
import styles from './search.module.css'

function getEditablePlaylistItems(data = {}) {
  return (Array.isArray(data.items) ? data.items : [])
    .filter((playlist) => playlist.canEdit || playlist.sourceType === 'agentmusic')
    .map((playlist) => ({
      id: playlist.id,
      title: playlist.title || playlist.name || 'Playlist',
      itemCount: Array.isArray(playlist.items)
        ? playlist.items.length
        : Number(playlist.itemCount) || 0,
    }))
    .filter((playlist) => playlist.id)
}

function createSearchTrackLibraryPayload(track = {}) {
  const uri = getTrackUri(track)
  const previewUrl = track.preview_url || track.previewUrl || ''
  const imageUrl = getItemImage(track, 'track')
  const playMode = uri
    ? TRACK_PLAY_MODES.SPOTIFY_REMOTE
    : previewUrl
      ? TRACK_PLAY_MODES.PREVIEW
      : TRACK_PLAY_MODES.UNAVAILABLE

  return {
    source_type: 'spotify',
    source_id: uri || (track.id ? `spotify:track:${track.id}` : ''),
    title: track.name || '',
    artists: Array.isArray(track.artists)
      ? track.artists.map((artist) => artist?.name || '').filter(Boolean)
      : [],
    album: track.album || '',
    image_url: imageUrl,
    preview_url: previewUrl,
    duration_ms: track.duration_ms ?? track.durationMs ?? null,
    uri,
    playMode,
    metadata: {
      provider: 'spotify',
      entityType: 'track',
      spotifyId: track.id || null,
      uri: uri || null,
      playMode,
      albumName: track.album?.name || '',
      artistLabel: getArtistNames(track.artists),
      externalUrl: track.external_urls?.spotify || null,
    },
  }
}

function Search() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, openAuthDialog, request } = useAuth()
  const { connect, isConnected } = useSpotify()
  const {
    activatePlayer,
    errorCode: spotifyPlaybackErrorCode,
    isConnecting: isSpotifyPlayerConnecting,
    isReady: isSpotifyPlayerReady,
  } = useSpotifyPlayback()
  const query = searchParams.get('q')?.trim() || ''
  const [activeTab, setActiveTab] = useState('all')
  const [results, setResults] = useState(() => normalizeSearchResults())
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [retryCount, setRetryCount] = useState(0)
  const [availablePlaylists, setAvailablePlaylists] = useState([])
  const [hasLoadedPlaylists, setHasLoadedPlaylists] = useState(false)
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false)
  const [addMenuTrackId, setAddMenuTrackId] = useState('')
  const [addingTrackId, setAddingTrackId] = useState('')
  const [addStatus, setAddStatus] = useState(null)

  useEffect(() => {
    setActiveTab('all')
    setAddMenuTrackId('')
    setAddStatus(null)
  }, [query])

  useEffect(() => {
    if (!isAuthenticated) {
      setAvailablePlaylists([])
      setHasLoadedPlaylists(false)
      setAddMenuTrackId('')
      setAddStatus(null)
    }
  }, [isAuthenticated])

  useEffect(() => {
    return subscribeLibraryPlaylistsUpdated(() => {
      setAvailablePlaylists([])
      setHasLoadedPlaylists(false)
    })
  }, [])

  useEffect(() => {
    if (!addMenuTrackId) {
      return undefined
    }

    function closeAddMenu() {
      setAddMenuTrackId('')
    }

    window.addEventListener('click', closeAddMenu)

    return () => {
      window.removeEventListener('click', closeAddMenu)
    }
  }, [addMenuTrackId])

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      if (!query) {
        setResults(normalizeSearchResults())
        setSearchError('')
        setIsSearching(false)
        return
      }

      setIsSearching(true)

      try {
        const params = new URLSearchParams({
          q: query,
          type: 'track,artist,album,playlist,show',
          limit: '8',
        })
        const data = await request(`/api/catalog/search?${params.toString()}`)

        if (cancelled) {
          return
        }

        setResults(normalizeSearchResults(data.results))
        setSearchError('')
      } catch (error) {
        if (!cancelled) {
          setSearchError(error?.message || t('library_error_title'))
          setResults(normalizeSearchResults())
        }
      } finally {
        if (!cancelled) {
          setIsSearching(false)
        }
      }
    }

    runSearch()

    return () => {
      cancelled = true
    }
  }, [query, request, retryCount, t])

  const resultCount = useMemo(() => getResultCount(results), [results])
  const topResult = useMemo(() => getTopResult(results), [results])
  const allSections = useMemo(() => buildAllSections(results, t), [results, t])
  const activeTabItems = useMemo(
    () => getTabItems(activeTab, results),
    [activeTab, results],
  )
  const activeTabTitle = useMemo(() => {
    switch (activeTab) {
      case 'track':
        return t('search_section_tracks')
      case 'artist':
        return t('search_section_artists')
      case 'playlist':
        return t('search_section_playlists')
      case 'album':
        return t('search_section_albums')
      case 'show':
        return t('search_section_shows')
      default:
        return t('search_results')
    }
  }, [activeTab, t])

  function handleTrackAction(track) {
    const trackAction = resolveTrackActionState({
      item: track,
      isConnected,
      isReady: isSpotifyPlayerReady,
      isConnecting: isSpotifyPlayerConnecting,
      errorCode: spotifyPlaybackErrorCode,
      t,
    })

    if (trackAction.disabled) {
      return
    }

    if (trackAction.mode === 'connect') {
      handleConnectSpotify()
      return
    }

    if (trackAction.mode === 'activate') {
      handleActivatePlayer()
      return
    }

    dispatch(
      startAgentPlayback({
        tracks: [
          {
            ...track,
            source: 'spotify',
            sourceType: 'spotify',
            sourceId: getTrackUri(track),
            uri: getTrackUri(track),
            previewUrl: track.preview_url || track.previewUrl || '',
            preview_url: track.preview_url || track.previewUrl || '',
            playMode:
              trackAction.mode === 'preview'
                ? TRACK_PLAY_MODES.PREVIEW
                : TRACK_PLAY_MODES.SPOTIFY_REMOTE,
            playable: trackAction.mode === 'preview',
          },
        ],
        playlistId: `search-track-${track.id}`,
        playlistTitle: track.name,
      }),
    )
  }

  async function loadEditablePlaylists({ force = false, trackId = '' } = {}) {
    if (!isAuthenticated) {
      return []
    }

    if (!force && hasLoadedPlaylists) {
      return availablePlaylists
    }

    setIsLoadingPlaylists(true)

    try {
      const data = await request('/api/library/playlists')
      const playlists = getEditablePlaylistItems(data)

      setAvailablePlaylists(playlists)
      setHasLoadedPlaylists(true)
      return playlists
    } catch (error) {
      setAddStatus({
        type: 'error',
        trackId,
        message: error?.message || t('search_load_playlists_failed'),
      })
      return []
    } finally {
      setIsLoadingPlaylists(false)
    }
  }

  function handleAddTrackClick(track) {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    const nextTrackId = addMenuTrackId === track.id ? '' : track.id
    setAddMenuTrackId(nextTrackId)
    setAddStatus(null)

    if (nextTrackId) {
      loadEditablePlaylists({ trackId: nextTrackId }).catch(() => {})
    }
  }

  async function handleAddTrackToPlaylist(track, playlist) {
    if (!track?.id || !playlist?.id || addingTrackId) {
      return
    }

    setAddingTrackId(track.id)
    setAddStatus(null)

    try {
      await request(`/api/library/playlists/${playlist.id}/items`, {
        method: 'POST',
        body: createSearchTrackLibraryPayload(track),
      })

      setAvailablePlaylists((currentPlaylists) =>
        currentPlaylists.map((item) =>
          item.id === playlist.id
            ? { ...item, itemCount: (Number(item.itemCount) || 0) + 1 }
            : item,
        ),
      )
      setAddStatus({
        type: 'success',
        trackId: track.id,
        message: t('search_added_to_playlist', {
          playlist: playlist.title,
        }),
      })
      emitLibraryPlaylistsUpdated({
        type: 'item-added',
        playlistId: playlist.id,
        trackId: track.id,
      })
    } catch (error) {
      setAddStatus({
        type: 'error',
        trackId: track.id,
        message: error?.message || t('search_add_to_playlist_failed'),
      })
    } finally {
      setAddingTrackId('')
    }
  }

  function handleOpenPlaylist(playlist) {
    navigate(`/playlist/${playlist.id}`)
  }

  function handleConnectSpotify() {
    if (!isAuthenticated) {
      openAuthDialog('login')
      return
    }

    connect(`/search?q=${encodeURIComponent(query)}`).catch(() => {})
  }

  function handleActivatePlayer() {
    activatePlayer().catch(() => {})
  }

  function handleTopResultPrimaryAction() {
    if (!topResult) {
      return
    }

    if (topResult.type === 'track') {
      handleTrackAction(topResult.item)
      return
    }

    if (topResult.type === 'playlist') {
      handleOpenPlaylist(topResult.item)
    }
  }

  return (
    <div className={styles.SearchPage}>
      <div className={styles.SearchShell}>
        <div className={styles.SearchMain}>
          <SearchHeader
            query={query}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            t={t}
          />

          {!query && (
            <SearchEmptyState
              title={t('search_empty_prompt_title')}
            >
              <div className={styles.SearchBrowseGrid}>
                {SEARCHCARDS.map((card) => (
                  <SearchPageCard
                    key={card.title}
                    cardData={{
                      bgcolor: card.bgcolor,
                      title: card.title,
                      imgurl: card.imgurl,
                    }}
                  />
                ))}
              </div>
            </SearchEmptyState>
          )}

          {query && isSearching && <SearchSkeleton />}

          {query && !isSearching && searchError && (
            <SearchEmptyState
              title={t('library_error_title')}
              body={searchError}
              actionLabel={t('search_retry')}
              onAction={() => setRetryCount((current) => current + 1)}
              tone="error"
            />
          )}

          {query && !isSearching && !searchError && resultCount === 0 && (
            <SearchEmptyState
              title={t('search_no_results_for', { query })}
              body={t('search_try_another_keyword')}
            />
          )}

          {query && !isSearching && !searchError && resultCount > 0 && (
            <>
              {activeTab === 'all' ? (
                <>
                  <SearchTopResult
                    result={topResult}
                    t={t}
                    onPrimaryAction={handleTopResultPrimaryAction}
                  />

                  {allSections.map((section) => (
                    <SearchResultList
                      key={section.key}
                      title={section.title}
                      items={section.items}
                      type={section.type}
                      t={t}
                      addMenuTrackId={addMenuTrackId}
                      addingTrackId={addingTrackId}
                      addStatus={addStatus}
                      availablePlaylists={availablePlaylists}
                      isLoadingPlaylists={isLoadingPlaylists}
                      onAddTrackClick={handleAddTrackClick}
                      onAddTrackToPlaylist={handleAddTrackToPlaylist}
                      onOpenPlaylist={handleOpenPlaylist}
                      onPlayTrack={handleTrackAction}
                    />
                  ))}
                </>
              ) : activeTabItems.length > 0 ? (
                <SearchResultList
                  title={activeTabTitle}
                  items={activeTabItems}
                  type={activeTab}
                  t={t}
                  addMenuTrackId={addMenuTrackId}
                  addingTrackId={addingTrackId}
                  addStatus={addStatus}
                  availablePlaylists={availablePlaylists}
                  isLoadingPlaylists={isLoadingPlaylists}
                  onAddTrackClick={handleAddTrackClick}
                  onAddTrackToPlaylist={handleAddTrackToPlaylist}
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handleTrackAction}
                />
              ) : (
                <SearchEmptyState
                  title={t('search_no_results_in_tab', {
                    tab: activeTabTitle,
                  })}
                  body={t('search_try_another_keyword')}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Search

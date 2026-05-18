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
  buildAgentPrompt,
  buildAllSections,
  buildBrowsePrompt,
  buildEmptyQueryPrompt,
  buildQueryPrompt,
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
import styles from './search.module.css'

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

  useEffect(() => {
    setActiveTab('all')
  }, [query])

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

  function openAgentWithPrompt(prompt) {
    navigate('/agent', {
      state: {
        prompt,
        autoSend: true,
      },
    })
  }

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
            resultCount={resultCount}
            t={t}
          />

          {!query && (
            <SearchEmptyState
              title={t('search_empty_prompt_title')}
              body={t('search_empty_prompt_body')}
              actionLabel={t('search_open_agent_for_query')}
              onAction={() => openAgentWithPrompt(buildBrowsePrompt())}
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
              body={t('search_try_agent')}
              actionLabel={t('search_open_agent_for_query')}
              onAction={() => openAgentWithPrompt(buildEmptyQueryPrompt(query))}
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
                    onAgentAction={() =>
                      topResult
                        ? openAgentWithPrompt(
                            buildAgentPrompt(topResult.item, topResult.type, {
                              query,
                            }),
                          )
                        : undefined
                    }
                  />

                  {allSections.map((section) => (
                    <SearchResultList
                      key={section.key}
                      title={section.title}
                      items={section.items}
                      type={section.type}
                      t={t}
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
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handleTrackAction}
                />
              ) : (
                <SearchEmptyState
                  title={t('search_no_results_in_tab', {
                    tab: activeTabTitle,
                  })}
                  body={t('search_try_agent')}
                  actionLabel={t('search_open_agent_for_query')}
                  onAction={() => openAgentWithPrompt(buildQueryPrompt(query))}
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

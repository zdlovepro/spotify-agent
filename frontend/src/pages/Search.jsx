import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import fallbackArtwork from '../assets/hero.png'
import SearchPageCard from '../components/cards/SearchPageCard'
import { SEARCHCARDS } from '../data/index.js'
import { useSpotify } from '../context/SpotifyContext.jsx'
import { startAgentPlayback } from '../store/index.js'
import styles from './search.module.css'

function getArtistNames(artists = []) {
  return artists.map((artist) => artist.name).filter(Boolean).join(', ')
}

function getImage(item, type) {
  if (type === 'track') {
    return item.album?.images?.[0]?.url || fallbackArtwork
  }

  return item.images?.[0]?.url || fallbackArtwork
}

function getSubtitle(item, type, t) {
  switch (type) {
    case 'track':
      return getArtistNames(item.artists) || t('appName')
    case 'artist':
      return (item.genres || []).slice(0, 3).join(', ') || t('artists')
    case 'album':
      return getArtistNames(item.artists) || t('albums')
    case 'playlist':
      return item.owner?.display_name || t('playlists')
    default:
      return t('appName')
  }
}

function getMeta(item, type, t) {
  switch (type) {
    case 'track':
      return item.preview_url
        ? t('search_listenable_meta')
        : t('search_not_listenable_meta')
    case 'artist':
      return item.followers?.total
        ? t('search_followers', {
            count: item.followers.total.toLocaleString(),
          })
        : ''
    case 'album':
      return item.release_date || ''
    case 'playlist':
      return item.tracks?.total
        ? t('search_tracks_count', {
            count: item.tracks.total,
          })
        : ''
    default:
      return ''
  }
}

function getSpotlightType(results) {
  if (results.tracks[0]) {
    return 'track'
  }

  if (results.artists[0]) {
    return 'artist'
  }

  if (results.albums[0]) {
    return 'album'
  }

  if (results.playlists[0]) {
    return 'playlist'
  }

  return ''
}

function buildAgentPrompt(item, type) {
  switch (type) {
    case 'track':
      return `Tell me about the song "${item.name}" and recommend a few tracks with a similar vibe.`
    case 'artist':
      return `Introduce the artist ${item.name} and recommend a few essential starting tracks.`
    case 'album':
      return `Break down the album "${item.name}" and tell me which songs I should start with.`
    case 'playlist':
      return `Use the playlist "${item.name}" as a reference and recommend more songs with a similar style.`
    default:
      return `Help me continue exploring ${item.name}.`
  }
}

function buildQueryPrompt(query) {
  return `I'm searching for "${query}". Help me decide what to start with and give me a smarter recommendation direction.`
}

function buildEmptyQueryPrompt(query) {
  return `I couldn't find "${query}" on Spotify. Please recommend similar music from a different angle.`
}

function buildBrowsePrompt() {
  return 'Recommend a set of songs that would be good to start with today.'
}

function ResultCard({ item, type, onAgentAction, onOpenPlaylist, onPlayTrack, t }) {
  const subtitle = getSubtitle(item, type, t)
  const meta = getMeta(item, type, t)

  return (
    <article className={styles.ResultCard}>
      <div className={styles.ResultArtBox}>
        <img
          src={getImage(item, type)}
          alt={item.name}
          className={`${styles.ResultArt} ${
            type === 'artist' ? styles.ResultArtRound : ''
          }`}
        />
      </div>

      <div className={styles.ResultBody}>
        <div className={styles.ResultHeader}>
          <span className={styles.ResultType}>{t(`search_result_${type}`)}</span>
          {meta && <span className={styles.ResultMeta}>{meta}</span>}
        </div>

        <h3 className={styles.ResultTitle}>{item.name}</h3>
        <p className={styles.ResultSubtitle}>{subtitle}</p>

        <div className={styles.ResultActions}>
          {type === 'track' && (
            <button
              type="button"
              className={styles.PrimaryBtn}
              disabled={!item.preview_url}
              onClick={() => onPlayTrack(item)}
            >
              {item.preview_url
                ? t('search_play_preview')
                : t('search_preview_missing')}
            </button>
          )}

          {type === 'playlist' && (
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={() => onOpenPlaylist(item)}
            >
              {t('search_open_playlist')}
            </button>
          )}

          {(type === 'artist' || type === 'album') && (
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={() => onAgentAction(buildAgentPrompt(item, type))}
            >
              {type === 'artist'
                ? t('search_send_artist_to_agent')
                : t('search_send_album_to_agent')}
            </button>
          )}

          {type === 'track' && (
            <button
              type="button"
              className={styles.SecondaryBtn}
              onClick={() => onAgentAction(buildAgentPrompt(item, type))}
            >
              {t('search_send_track_to_agent')}
            </button>
          )}

          {type === 'playlist' && (
            <button
              type="button"
              className={styles.SecondaryBtn}
              onClick={() => onAgentAction(buildAgentPrompt(item, type))}
            >
              {t('search_send_playlist_to_agent')}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function SearchSection({
  title,
  items,
  type,
  onAgentAction,
  onOpenPlaylist,
  onPlayTrack,
  t,
}) {
  if (!items.length) {
    return null
  }

  return (
    <section className={styles.Section}>
      <div className={styles.SectionHeader}>
        <h2 className={styles.SectionTitle}>{title}</h2>
        <span className={styles.SectionCount}>{items.length}</span>
      </div>

      <div className={styles.ResultGrid}>
        {items.map((item) => (
          <ResultCard
            key={item.id}
            item={item}
            type={type}
            onAgentAction={onAgentAction}
            onOpenPlaylist={onOpenPlaylist}
            onPlayTrack={onPlayTrack}
            t={t}
          />
        ))}
      </div>
    </section>
  )
}

function Search() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, login, request } = useSpotify()
  const query = searchParams.get('q')?.trim() || ''
  const [results, setResults] = useState({
    tracks: [],
    artists: [],
    albums: [],
    playlists: [],
  })
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      if (!query || !isAuthenticated) {
        setResults({
          tracks: [],
          artists: [],
          albums: [],
          playlists: [],
        })
        setSearchError('')
        setIsSearching(false)
        return
      }

      setIsSearching(true)

      try {
        const params = new URLSearchParams({
          q: query,
          type: 'track,artist,album,playlist',
          limit: '6',
        })
        const data = await request(`/api/spotify/search?${params.toString()}`)

        if (cancelled) {
          return
        }

        setResults({
          tracks: data.tracks?.items || [],
          artists: data.artists?.items || [],
          albums: data.albums?.items || [],
          playlists: data.playlists?.items || [],
        })
        setSearchError('')
      } catch (error) {
        if (!cancelled) {
          setSearchError(error.message)
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
  }, [isAuthenticated, query, request])

  const resultCount = useMemo(
    () =>
      results.tracks.length +
      results.artists.length +
      results.albums.length +
      results.playlists.length,
    [results],
  )

  const spotlight = useMemo(
    () =>
      results.tracks[0] ||
      results.artists[0] ||
      results.albums[0] ||
      results.playlists[0] ||
      null,
    [results],
  )

  const spotlightType = getSpotlightType(results)

  function openAgentWithPrompt(prompt) {
    navigate('/agent', {
      state: {
        prompt,
        autoSend: true,
      },
    })
  }

  function handlePlayTrack(track) {
    dispatch(
      startAgentPlayback({
        tracks: [track],
        playlistId: `search-track-${track.id}`,
        playlistTitle: track.name,
      }),
    )
  }

  function handleOpenPlaylist(playlist) {
    navigate(`/playlist/${playlist.id}`)
  }

  return (
    <div className={styles.SearchPage}>
      <div className={styles.Search}>
        {query ? (
          <>
            <section className={styles.SearchHero}>
              <div>
                <p className={styles.Eyebrow}>{t('search_results')}</p>
                <h1 className={styles.HeroTitle}>
                  {t('search_results_for', { query })}
                </h1>
                <p className={styles.HeroText}>{t('search_intro_body')}</p>
                <div className={styles.HeroActions}>
                  <button
                    type="button"
                    className={styles.PrimaryBtn}
                    onClick={() => openAgentWithPrompt(buildQueryPrompt(query))}
                  >
                    {t('search_open_agent_for_query')}
                  </button>
                  {spotlight && (
                    <button
                      type="button"
                      className={styles.SecondaryBtn}
                      onClick={() =>
                        openAgentWithPrompt(buildAgentPrompt(spotlight, spotlightType))
                      }
                    >
                      {t('search_send_spotlight_to_agent')}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.HeroStats}>
                <div className={styles.StatCard}>
                  <span className={styles.StatLabel}>{t('search_results')}</span>
                  <strong className={styles.StatValue}>
                    {isSearching ? '...' : resultCount}
                  </strong>
                  <p className={styles.StatText}>
                    {isSearching ? t('search_loading') : t('search_agent_hint')}
                  </p>
                </div>
                <div className={styles.StatCard}>
                  <span className={styles.StatLabel}>{t('search_spotlight')}</span>
                  <strong className={styles.StatValue}>
                    {spotlight?.name || t('search_no_results_short')}
                  </strong>
                  <p className={styles.StatText}>
                    {spotlight
                      ? getSubtitle(spotlight, spotlightType, t)
                      : t('search_agent_hint')}
                  </p>
                </div>
              </div>
            </section>

            {!isAuthenticated && (
              <section className={styles.LoginCard}>
                <h2 className={styles.SectionTitle}>{t('search_login_title')}</h2>
                <p className={styles.EmptyText}>{t('search_login_body')}</p>
                <button
                  type="button"
                  className={styles.PrimaryBtn}
                  onClick={login}
                >
                  {t('login')}
                </button>
              </section>
            )}

            {isAuthenticated && isSearching && (
              <section className={styles.EmptyState}>
                <p className={styles.EmptyText}>{t('search_loading')}</p>
              </section>
            )}

            {isAuthenticated && !isSearching && searchError && (
              <section className={styles.EmptyState}>
                <p className={styles.EmptyText}>{searchError}</p>
              </section>
            )}

            {isAuthenticated && !isSearching && !searchError && !resultCount && (
              <section className={styles.EmptyState}>
                <h2 className={styles.SectionTitle}>{t('search_no_results')}</h2>
                <p className={styles.EmptyText}>{t('search_try_agent')}</p>
                <button
                  type="button"
                  className={styles.PrimaryBtn}
                  onClick={() =>
                    openAgentWithPrompt(buildEmptyQueryPrompt(query))
                  }
                >
                  {t('search_open_agent_for_query')}
                </button>
              </section>
            )}

            {isAuthenticated && !isSearching && resultCount > 0 && (
              <>
                <SearchSection
                  title={t('search_section_tracks')}
                  items={results.tracks}
                  type="track"
                  onAgentAction={openAgentWithPrompt}
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handlePlayTrack}
                  t={t}
                />
                <SearchSection
                  title={t('search_section_artists')}
                  items={results.artists}
                  type="artist"
                  onAgentAction={openAgentWithPrompt}
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handlePlayTrack}
                  t={t}
                />
                <SearchSection
                  title={t('search_section_albums')}
                  items={results.albums}
                  type="album"
                  onAgentAction={openAgentWithPrompt}
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handlePlayTrack}
                  t={t}
                />
                <SearchSection
                  title={t('search_section_playlists')}
                  items={results.playlists}
                  type="playlist"
                  onAgentAction={openAgentWithPrompt}
                  onOpenPlaylist={handleOpenPlaylist}
                  onPlayTrack={handlePlayTrack}
                  t={t}
                />
              </>
            )}
          </>
        ) : (
          <>
            <section className={styles.SearchHero}>
              <div>
                <p className={styles.Eyebrow}>{t('browseAll')}</p>
                <h1 className={styles.HeroTitle}>{t('search_intro_title')}</h1>
                <p className={styles.HeroText}>{t('search_intro_body')}</p>
                <div className={styles.HeroActions}>
                  <button
                    type="button"
                    className={styles.PrimaryBtn}
                    onClick={() => openAgentWithPrompt(buildBrowsePrompt())}
                  >
                    {t('search_open_agent_for_query')}
                  </button>
                </div>
              </div>

              <div className={styles.HeroStats}>
                <div className={styles.StatCard}>
                  <span className={styles.StatLabel}>{t('search_results')}</span>
                  <strong className={styles.StatValue}>{SEARCHCARDS.length}</strong>
                  <p className={styles.StatText}>{t('search_browse_hint')}</p>
                </div>
              </div>
            </section>

            <section className={styles.Section}>
              <div className={styles.SectionHeader}>
                <h2 className={styles.SectionTitle}>{t('browseAll')}</h2>
              </div>
              <div className={styles.SearchCardGrid}>
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
            </section>
          </>
        )}
      </div>
    </div>
  )
}

export default Search

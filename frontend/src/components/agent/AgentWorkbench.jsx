import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useAgent } from '../../context/AgentContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSpotifyPlayback } from '../../context/SpotifyPlaybackContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import {
  getTrackPlaybackStatusKey,
  resolveTrackPlaybackMeta,
  TRACK_PLAY_MODES,
} from '../../lib/spotify.js'
import {
  executePlayerActions,
  startAgentPlayback,
} from '../../store/index.js'
import styles from './agent-workbench.module.css'

function formatIntentLabel(intent, t) {
  switch (intent) {
    case 'control_player':
      return t('agent_intent_control')
    case 'play_music':
      return t('agent_intent_play')
    case 'search_entity':
      return t('agent_intent_search')
    case 'create_playlist':
      return t('agent_intent_playlist')
    case 'generate_recommendation':
    default:
      return t('agent_intent_recommend')
  }
}

function getArtifactTracks(artifacts = {}) {
  const trackMap = new Map()

  ;[
    ...(Array.isArray(artifacts.recommendation_set?.tracks)
      ? artifacts.recommendation_set.tracks
      : []),
    ...(Array.isArray(artifacts.tracks) ? artifacts.tracks : []),
    ...(artifacts.track ? [artifacts.track] : []),
  ].forEach((track, index) => {
    if (!track || typeof track !== 'object') {
      return
    }

    const key =
      track.sourceId || track.source_id || track.uri || track.id || `track-${index}`

    if (!trackMap.has(key)) {
      trackMap.set(key, track)
    }
  })

  return [...trackMap.values()]
}

function hasPrimaryPlayback(track) {
  const playback = resolveTrackPlaybackMeta(track)

  return (
    playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO ||
    playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE
  )
}

function hasPrimaryPlayableTracks(tracks = []) {
  return tracks.some((track) => hasPrimaryPlayback(track))
}

function getTrackPlaybackLabel(track, t, allowRemote = false) {
  return t(getTrackPlaybackStatusKey(track, { allowRemote }))
}

function getTrackSourceLabel(track, t) {
  const playback = resolveTrackPlaybackMeta(track)

  switch (playback.playMode) {
    case TRACK_PLAY_MODES.LOCAL_AUDIO:
      return t('player_source_local_audio')
    case TRACK_PLAY_MODES.SPOTIFY_REMOTE:
      return t('player_source_spotify_remote')
    case TRACK_PLAY_MODES.PREVIEW:
      return t('player_source_preview')
    case TRACK_PLAY_MODES.UNAVAILABLE:
    default:
      return t('player_source_unavailable')
  }
}

function getTrackDescription(track, t) {
  const artists = Array.isArray(track.artists)
    ? track.artists.filter(Boolean).join(', ')
    : ''
  const album =
    typeof track.album === 'string'
      ? track.album
      : track.album?.name || ''

  return [artists || t('appName'), album].filter(Boolean).join(' · ')
}

function MessageRichText({ content }) {
  const blocks = String(content || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)

  if (!blocks.length) {
    return null
  }

  return blocks.map((block, index) => {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)

    if (lines.length > 1 && lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      return (
        <ul key={`ul-${index}`} className={styles.BubbleList}>
          {lines.map((line, lineIndex) => (
            <li key={`ul-item-${lineIndex}`}>
              {line.replace(/^\s*[-*]\s+/, '')}
            </li>
          ))}
        </ul>
      )
    }

    if (lines.length > 1 && lines.every((line) => /^\s*\d+\.\s+/.test(line))) {
      return (
        <ol key={`ol-${index}`} className={styles.BubbleList}>
          {lines.map((line, lineIndex) => (
            <li key={`ol-item-${lineIndex}`}>
              {line.replace(/^\s*\d+\.\s+/, '')}
            </li>
          ))}
        </ol>
      )
    }

    return (
      <p key={`p-${index}`} className={styles.BubbleText}>
        {block}
      </p>
    )
  })
}

function AgentTypingIndicator({ t }) {
  return (
    <div className={styles.TypingState}>
      <span className={styles.TypingLabel}>{t('agent_thinking')}</span>
      <span className={styles.TypingDots} aria-hidden="true">
        <span className={styles.TypingDot} />
        <span className={styles.TypingDot} />
        <span className={styles.TypingDot} />
      </span>
    </div>
  )
}

function AgentErrorState({ message, t }) {
  return (
    <div className={styles.MessageErrorState}>
      <p className={styles.MessageErrorTitle}>{t('agent_response_failed')}</p>
      <p className={styles.MessageErrorBody}>
        {message.error || t('agent_response_failed_hint')}
      </p>
    </div>
  )
}

function findPreferredStartIndex(
  tracks = [],
  { canUseSpotify = false } = {},
) {
  return tracks.findIndex((track) => {
    const playback = resolveTrackPlaybackMeta(track)

    if (playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO && playback.audioUrl) {
      return true
    }

    if (
      playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE &&
      canUseSpotify &&
      playback.remoteUri
    ) {
      return true
    }

    return false
  })
}

function getPlayButtonLabel(track, t, { isConnected, isSpotifyPlaybackReady }) {
  const playback = resolveTrackPlaybackMeta(track)

  if (playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO) {
    return t('agent_action_play')
  }

  if (playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE) {
    if (!isConnected) {
      return t('agent_action_connect_spotify')
    }

    if (!isSpotifyPlaybackReady) {
      return t('agent_action_activate_spotify')
    }

    return t('agent_action_play_spotify')
  }

  return t('agent_action_play')
}

function AgentArtifact({
  message,
  onPlayTracks,
  onFavoriteTrack,
  onAddTracksToPlaylist,
  isConnected,
  isSpotifyPlaybackReady,
  isAuthenticated,
  artifactNotice,
  isActionBusy,
  t,
}) {
  const artifacts = message.artifacts || {}
  const recommendationSet = artifacts.recommendation_set || null
  const tracks = getArtifactTracks(artifacts)
  const playlist = artifacts.playlist || null
  const canPlayArtifactTracks = tracks.length > 0 && hasPrimaryPlayableTracks(tracks)
  const primaryTrack = artifacts.track || tracks[0] || null

  return (
    <>
      {(primaryTrack ||
        artifacts.artist ||
        artifacts.album ||
        playlist ||
        tracks.length > 0 ||
        recommendationSet) && (
        <div className={styles.ArtifactBox}>
          <div className={styles.ArtifactHeader}>
            <div>
              <p className={styles.ArtifactTitle}>
                {recommendationSet?.title ||
                  artifacts.recommendationTitle ||
                  playlist?.name ||
                  primaryTrack?.name ||
                  artifacts.artist?.name ||
                  artifacts.album?.name ||
                  t('agent_tracks')}
              </p>
              {recommendationSet?.summary && (
                <p className={styles.ArtifactCaption}>{recommendationSet.summary}</p>
              )}
            </div>
            <div className={styles.HeaderActions}>
              {canPlayArtifactTracks && (
                <button
                  type="button"
                  className={styles.ActionBtn}
                  onClick={() =>
                    onPlayTracks(tracks, {
                      messageId: message.id,
                      playlistId:
                        playlist?.id ||
                        recommendationSet?.id ||
                        artifacts.recommendationId ||
                        `agent-message-${message.id}`,
                      playlistTitle:
                        playlist?.name ||
                        recommendationSet?.title ||
                        artifacts.recommendationTitle ||
                        t('agent_queue_title'),
                    }).catch(() => {})
                  }
                >
                  {playlist ? t('agent_play_playlist') : t('agent_play_recommendation')}
                </button>
              )}
              {tracks.length > 0 && (
                <button
                  type="button"
                  className={styles.SecondaryActionBtn}
                  disabled={isActionBusy}
                  onClick={() =>
                    onAddTracksToPlaylist(message, tracks, {
                      suggestedTitle:
                        recommendationSet?.title ||
                        playlist?.name ||
                        t('agent_saved_playlist_title'),
                    }).catch(() => {})
                  }
                >
                  {isAuthenticated
                    ? t('agent_add_set_to_playlist')
                    : t('agent_login_to_save')}
                </button>
              )}
            </div>
          </div>

          {playlist && (
            <div className={styles.TrackRow}>
              <div className={styles.TrackMain}>
                <div>
                  <span className={styles.TrackName}>{playlist.name}</span>
                  <span className={styles.TrackArtist}>
                    {playlist.description ||
                      t('agent_playlist_items_count', {
                        count:
                          playlist.itemCount ||
                          recommendationSet?.trackCount ||
                          tracks.length ||
                          0,
                      })}
                  </span>
                </div>
                <div className={styles.TrackMetaRow}>
                  <span className={styles.TrackTag}>
                    {playlist.sourceType === 'spotify'
                      ? t('search_source_spotify')
                      : t('agent_playlist_source_local')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {primaryTrack && !recommendationSet && tracks.length <= 1 && (
            <div className={styles.TrackRow}>
              <div className={styles.TrackMain}>
                <div>
                  <span className={styles.TrackName}>{primaryTrack.name}</span>
                  <span className={styles.TrackArtist}>
                    {getTrackDescription(primaryTrack, t)}
                  </span>
                </div>
                <div className={styles.TrackMetaRow}>
                  <span className={styles.TrackTag}>
                    {getTrackSourceLabel(primaryTrack, t)}
                  </span>
                  <span className={styles.TrackTag}>
                    {getTrackPlaybackLabel(primaryTrack, t, isConnected)}
                  </span>
                </div>
              </div>
              <div className={styles.TrackActions}>
                {hasPrimaryPlayback(primaryTrack) && (
                  <button
                    type="button"
                    className={styles.ActionBtn}
                    onClick={() =>
                      onPlayTracks([primaryTrack], {
                        messageId: message.id,
                        playlistId: `agent-track-${message.id}`,
                        playlistTitle: primaryTrack.name || t('agent_queue_title'),
                      }).catch(() => {})
                    }
                  >
                    {getPlayButtonLabel(primaryTrack, t, {
                      isConnected,
                      isSpotifyPlaybackReady,
                    })}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.SecondaryActionBtn}
                  disabled={isActionBusy}
                  onClick={() => onFavoriteTrack(message, primaryTrack).catch(() => {})}
                >
                  {isAuthenticated
                    ? t('agent_save_favorite')
                    : t('agent_login_to_save')}
                </button>
                <button
                  type="button"
                  className={styles.SecondaryActionBtn}
                  disabled={isActionBusy}
                  onClick={() =>
                    onAddTracksToPlaylist(message, [primaryTrack], {
                      suggestedTitle: `${primaryTrack.name} ${t('playlists')}`,
                    }).catch(() => {})
                  }
                >
                  {isAuthenticated
                    ? t('agent_add_to_playlist')
                    : t('agent_login_to_save')}
                </button>
              </div>
            </div>
          )}

          {artifacts.artist && (
            <div className={styles.TrackRow}>
              <div className={styles.TrackMain}>
                <div>
                  <span className={styles.TrackName}>{artifacts.artist.name}</span>
                  <span className={styles.TrackArtist}>
                    {(artifacts.artist.genres || []).slice(0, 3).join(', ') ||
                      t('artists')}
                  </span>
                </div>
                <div className={styles.TrackMetaRow}>
                  <span className={styles.TrackTag}>
                    {t('agent_artist_popularity', {
                      popularity: artifacts.artist.popularity || 0,
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {artifacts.album && (
            <div className={styles.TrackRow}>
              <div className={styles.TrackMain}>
                <div>
                  <span className={styles.TrackName}>{artifacts.album.name}</span>
                  <span className={styles.TrackArtist}>
                    {artifacts.album.artists?.join(', ') || t('albums')}
                  </span>
                </div>
                <div className={styles.TrackMetaRow}>
                  <span className={styles.TrackTag}>
                    {artifacts.album.releaseDate || t('albums')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {(recommendationSet || tracks.length > 1) && (
            <div className={styles.TrackList}>
              {tracks.slice(0, 6).map((track, index) => (
                <div
                  key={track.sourceId || track.uri || track.id || `${message.id}-${index}`}
                  className={styles.TrackRow}
                >
                  <div className={styles.TrackMain}>
                    <div>
                      <span className={styles.TrackName}>{track.name}</span>
                      <span className={styles.TrackArtist}>
                        {getTrackDescription(track, t)}
                      </span>
                    </div>
                    <div className={styles.TrackMetaRow}>
                      <span className={styles.TrackTag}>
                        {getTrackSourceLabel(track, t)}
                      </span>
                      <span className={styles.TrackTag}>
                        {getTrackPlaybackLabel(track, t, isConnected)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.TrackActions}>
                    {hasPrimaryPlayback(track) && (
                      <button
                        type="button"
                        className={styles.ActionBtn}
                        onClick={() =>
                          onPlayTracks([track], {
                            messageId: message.id,
                            playlistId:
                              recommendationSet?.id || `agent-track-${message.id}`,
                            playlistTitle:
                              track.name ||
                              recommendationSet?.title ||
                              t('agent_queue_title'),
                          }).catch(() => {})
                        }
                      >
                        {getPlayButtonLabel(track, t, {
                          isConnected,
                          isSpotifyPlaybackReady,
                        })}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.SecondaryActionBtn}
                      disabled={isActionBusy}
                      onClick={() => onFavoriteTrack(message, track).catch(() => {})}
                    >
                      {isAuthenticated
                        ? t('agent_save_favorite')
                        : t('agent_login_to_save')}
                    </button>
                    <button
                      type="button"
                      className={styles.SecondaryActionBtn}
                      disabled={isActionBusy}
                      onClick={() =>
                        onAddTracksToPlaylist(message, [track], {
                          suggestedTitle:
                            recommendationSet?.title ||
                            `${track.name} ${t('playlists')}`,
                        }).catch(() => {})
                      }
                    >
                      {isAuthenticated
                        ? t('agent_add_to_playlist')
                        : t('agent_login_to_save')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {artifactNotice && (
            <p className={styles.ActionNotice}>{artifactNotice}</p>
          )}
        </div>
      )}

    </>
  )
}

function AgentWorkbench({
  prefilledPrompt = '',
  autoSendPrefilledPrompt = false,
  onPrefilledPromptConsumed = undefined,
}) {
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { isAuthenticated, openAuthDialog, request, user } = useAuth()
  const { connect, isConnected, profile } = useSpotify()
  const {
    activatePlayer,
    deviceId: spotifyDeviceId,
    isReady: isSpotifyPlaybackReady,
  } = useSpotifyPlayback()
  const {
    conversations,
    currentConversation,
    error,
    isBootstrapping,
    isSending,
    loadConversation,
    sendMessage,
    startNewConversation,
  } = useAgent()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [message, setMessage] = useState('')
  const [artifactNotices, setArtifactNotices] = useState({})
  const [busyArtifactKey, setBusyArtifactKey] = useState('')
  const [isConversationSidebarOpen, setIsConversationSidebarOpen] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const messageEndRef = useRef(null)
  const messageInputRef = useRef(null)

  const quickPrompts = useMemo(
    () => [
      t('agent_quick_prompt_1'),
      t('agent_quick_prompt_2'),
      t('agent_quick_prompt_3'),
      t('agent_quick_prompt_4'),
    ],
    [t],
  )

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentConversation.messages, isSending])

  useEffect(() => {
    if (!messageInputRef.current) {
      return
    }

    messageInputRef.current.style.height = 'auto'
    messageInputRef.current.style.height = `${Math.min(
      messageInputRef.current.scrollHeight,
      180,
    )}px`
  }, [message])

  useEffect(() => {
    if (!prefilledPrompt) {
      return
    }

    if (autoSendPrefilledPrompt) {
      handleSend(prefilledPrompt).catch(() => {})
      onPrefilledPromptConsumed?.()
      return
    }

    setMessage(prefilledPrompt)
    onPrefilledPromptConsumed?.()
  }, [autoSendPrefilledPrompt, onPrefilledPromptConsumed, prefilledPrompt])

  async function handleSend(inputMessage) {
    const nextMessage = String(inputMessage || message).trim()

    if (!nextMessage) {
      return
    }

    setMessage('')

    const response = await sendMessage({
      message: nextMessage,
      context: {
        currentTrackId:
          trackData.source === 'spotify' || trackData.source === 'agent'
            ? trackData.id
            : '',
        currentPlaylistId: trackData.playlistId || '',
        playerState: isPlaying ? 'playing' : 'paused',
        spotifyPlaybackReady: isSpotifyPlaybackReady,
        currentDeviceId: spotifyDeviceId || '',
        currentTrack: trackData?.id
          ? {
              id: trackData.id || '',
              sourceType: trackData.sourceType || trackData.source_type || '',
              sourceId: trackData.sourceId || trackData.source_id || '',
              name: trackData.name || trackData.trackName || '',
              artists: Array.isArray(trackData.artists) ? trackData.artists : [],
              album: trackData.album || '',
              image: trackData.image || trackData.trackImg || '',
              durationMs: trackData.durationMs || trackData.duration_ms || 0,
              audioUrl: trackData.audioUrl || '',
              uri: trackData.uri || trackData.remoteUri || '',
              playMode: trackData.playMode || '',
              playable: trackData.playable === true,
            }
          : null,
      },
    })

    if (response?.assistant?.actions?.length) {
      dispatch(executePlayerActions(response.assistant.actions))
    }
  }

  function handlePromptClick(prompt) {
    handleSend(prompt).catch(() => {})
  }

  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter') {
      return
    }

    if (event.shiftKey || isComposing || event.nativeEvent?.isComposing) {
      return
    }

    event.preventDefault()

    if (!isSending && !isBootstrapping) {
      handleSend().catch(() => {})
    }
  }

  function setArtifactNotice(messageId, notice) {
    setArtifactNotices((currentState) => ({
      ...currentState,
      [messageId]: notice,
    }))
  }

  async function handlePlayTracks(tracks, options = {}) {
    const normalizedTracks = Array.isArray(tracks) ? tracks : []
    const hasSpotifyTracks = normalizedTracks.some((track) => {
      const playback = resolveTrackPlaybackMeta(track)
      return playback.playMode === TRACK_PLAY_MODES.SPOTIFY_REMOTE
    })

    let canUseSpotify = isConnected && isSpotifyPlaybackReady

    if (hasSpotifyTracks && !isAuthenticated) {
      setArtifactNotice(options.messageId, t('agent_notice_login_spotify'))
      openAuthDialog('login')
      return
    }

    if (hasSpotifyTracks && !isConnected) {
      const hasLocalFallback = normalizedTracks.some((track) => {
        const playback = resolveTrackPlaybackMeta(track)
        return playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO && playback.audioUrl
      })

      if (!hasLocalFallback) {
        setArtifactNotice(options.messageId, t('agent_notice_connect_spotify'))
        connect('/agent')
        return
      }

      setArtifactNotice(options.messageId, t('agent_notice_partial_spotify'))
    }

    if (hasSpotifyTracks && isConnected && !isSpotifyPlaybackReady) {
      const activated = await activatePlayer()

      if (!activated) {
        const hasLocalFallback = normalizedTracks.some((track) => {
          const playback = resolveTrackPlaybackMeta(track)
          return playback.playMode === TRACK_PLAY_MODES.LOCAL_AUDIO && playback.audioUrl
        })

        if (!hasLocalFallback) {
          setArtifactNotice(options.messageId, t('agent_notice_activate_spotify'))
          return
        }

        setArtifactNotice(options.messageId, t('agent_notice_partial_spotify'))
      } else {
        canUseSpotify = true
        setArtifactNotice(options.messageId, '')
      }
    }

    const startIndex = findPreferredStartIndex(normalizedTracks, {
      canUseSpotify,
    })

    if (startIndex < 0) {
      setArtifactNotice(options.messageId, t('agent_notice_not_playable'))
      return
    }

    dispatch(
      startAgentPlayback({
        tracks: normalizedTracks,
        startIndex,
        playlistId: options.playlistId,
        playlistTitle: options.playlistTitle,
      }),
    )
  }

  async function ensurePlaylistTarget(suggestedTitle = '') {
    const defaultTitle = String(
      suggestedTitle || t('agent_saved_playlist_title'),
    ).trim()
    const requestedTitle = window.prompt(t('agent_playlist_prompt'), defaultTitle)

    if (!requestedTitle) {
      return null
    }

    const nextTitle = requestedTitle.trim()

    if (!nextTitle) {
      return null
    }

    const playlistData = await request('/api/library/playlists')
    const existingPlaylist = (playlistData.items || []).find(
      (playlist) => String(playlist.name || '').trim() === nextTitle,
    )

    if (existingPlaylist) {
      return existingPlaylist
    }

    const createdPlaylist = await request('/api/library/playlists', {
      method: 'POST',
      body: {
        title: nextTitle,
      },
    })

    return createdPlaylist.playlist
  }

  async function handleFavoriteTrack(messageItem, track) {
    if (!isAuthenticated) {
      setArtifactNotice(messageItem.id, t('agent_notice_login_save'))
      openAuthDialog('login')
      return
    }

    setBusyArtifactKey(`favorite:${messageItem.id}`)

    try {
      await request('/api/library/favorites', {
        method: 'POST',
        body: {
          ...track,
          favorite_type: 'track',
        },
      })
      setArtifactNotice(messageItem.id, t('agent_notice_saved_favorite'))
    } catch (actionError) {
      setArtifactNotice(
        messageItem.id,
        actionError.message || t('agent_notice_save_failed'),
      )
    } finally {
      setBusyArtifactKey('')
    }
  }

  async function handleAddTracksToPlaylist(
    messageItem,
    tracks,
    { suggestedTitle } = {},
  ) {
    if (!isAuthenticated) {
      setArtifactNotice(messageItem.id, t('agent_notice_login_save'))
      openAuthDialog('login')
      return
    }

    const normalizedTracks = Array.isArray(tracks) ? tracks : []

    if (!normalizedTracks.length) {
      return
    }

    setBusyArtifactKey(`playlist:${messageItem.id}`)

    try {
      const playlist = await ensurePlaylistTarget(suggestedTitle)

      if (!playlist?.id) {
        setBusyArtifactKey('')
        return
      }

      let addedCount = 0

      for (const track of normalizedTracks) {
        try {
          await request(`/api/library/playlists/${playlist.id}/items`, {
            method: 'POST',
            body: track,
          })
          addedCount += 1
        } catch {
          continue
        }
      }

      setArtifactNotice(
        messageItem.id,
        t('agent_notice_saved_playlist', {
          count: addedCount,
          playlist: playlist.name || suggestedTitle || t('playlists'),
        }),
      )
    } catch (actionError) {
      setArtifactNotice(
        messageItem.id,
        actionError.message || t('agent_notice_save_failed'),
      )
    } finally {
      setBusyArtifactKey('')
    }
  }

  const identityLabel = isAuthenticated
    ? user?.displayName || user?.email || t('appName')
    : t('agent_guest_label')
  const modeLabel = !isAuthenticated
    ? t('mode_guest')
    : isConnected
      ? t('mode_spotify_enhanced')
      : t('mode_local')

  return (
    <div
      className={`${styles.Shell} ${
        isConversationSidebarOpen
          ? styles.ShellSidebarOpen
          : styles.ShellSidebarClosed
      }`}
    >
      <aside
        id="agent-conversation-sidebar"
        className={`${styles.Sidebar} ${
          isConversationSidebarOpen ? styles.SidebarOpen : styles.SidebarClosed
        }`}
      >
        <div className={styles.SidebarHeader}>
          <div>
            <p className={styles.Eyebrow}>{t('agent_conversations')}</p>
            <h2 className={styles.Title}>{t('agent_title')}</h2>
          </div>
        </div>

        <div className={styles.SummaryCard}>
          <p className={styles.Eyebrow}>{t('agent_mode_title')}</p>
          <strong className={styles.ConversationTitle}>{modeLabel}</strong>
          {!isAuthenticated && (
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={() => openAuthDialog('login')}
            >
              {t('agent_guest_cta')}
            </button>
          )}
          {isAuthenticated && !isConnected && (
            <button
              type="button"
              className={styles.PrimaryBtn}
              onClick={() => connect('/agent')}
            >
              {t('spotify_connect')}
            </button>
          )}
        </div>

        <div className={styles.SummaryCard}>
          <p className={styles.Eyebrow}>{t('agent_now_playing')}</p>
          <strong className={styles.ConversationTitle}>
            {trackData.trackName || t('appName')}
          </strong>
          <p className={styles.NowPlaying}>
            {trackData.trackArtist || profile?.display_name || identityLabel}
          </p>
        </div>

        <div className={styles.ConversationList}>
          {isAuthenticated ? (
            isBootstrapping ? (
              <div className={styles.SummaryCard}>
                <p className={styles.StatusText}>{t('agent_loading_conversations')}</p>
              </div>
            ) : conversations.length ? (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  className={`${styles.ConversationBtn} ${
                    currentConversation.id === conversation.id
                      ? styles.ConversationActive
                      : ''
                  }`}
                  onClick={() => loadConversation(conversation.id)}
                >
                  <span className={styles.ConversationTitle}>
                    {conversation.title || t('agent_new_chat')}
                  </span>
                  <span className={styles.ConversationPreview}>
                    {conversation.lastMessagePreview || t('agent_no_messages')}
                  </span>
                  <span className={styles.ConversationMeta}>
                    {t('agent_message_count', {
                      count: conversation.messageCount || 0,
                    })}
                  </span>
                </button>
              ))
            ) : (
              <div className={styles.SummaryCard}>
                <p className={styles.StatusText}>{t('agent_no_conversations')}</p>
              </div>
            )
          ) : (
            <div className={styles.SummaryCard}>
              <p className={styles.StatusText}>{t('agent_guest_saved_note')}</p>
            </div>
          )}
        </div>
      </aside>

      <section className={styles.Chat}>
        <div className={styles.ChatHeader}>
          <div className={styles.ChatHeaderContent}>
            <div className={styles.ChatHeaderActions}>
              <button
                type="button"
                className={`${styles.SidebarToggleBtn} ${
                  isConversationSidebarOpen ? styles.SidebarToggleBtnActive : ''
                }`}
                onClick={() =>
                  setIsConversationSidebarOpen((currentValue) => !currentValue)
                }
                aria-controls="agent-conversation-sidebar"
                aria-expanded={isConversationSidebarOpen}
                title={
                  isConversationSidebarOpen
                    ? t('agent_hide_conversations')
                    : t('agent_show_conversations')
                }
                aria-label={
                  isConversationSidebarOpen
                    ? t('agent_hide_conversations')
                    : t('agent_show_conversations')
                }
              >
                <span className={styles.SidebarToggleIcon} aria-hidden="true">
                  {isConversationSidebarOpen ? '<' : '>'}
                </span>
                <span className={styles.SidebarToggleLabel}>
                  {t('agent_conversations')}
                </span>
              </button>

              <button
                type="button"
                className={styles.ChatSecondaryBtn}
                onClick={startNewConversation}
              >
                {t('agent_new_chat')}
              </button>
            </div>

          </div>
        </div>

        <div className={styles.Messages}>
          <div className={`${styles.MessageThread} ${styles.ChatColumn}`}>
            {currentConversation.messages?.length ? (
              currentConversation.messages.map((messageItem) => {
                return (
                  <div
                    key={messageItem.id}
                    className={`${styles.MessageRow} ${
                      messageItem.role === 'user' ? styles.MessageUser : ''
                    }`}
                  >
                    <div
                      className={`${styles.Bubble} ${
                        messageItem.role === 'user' ? styles.BubbleUser : ''
                      }`}
                    >
                      {messageItem.intent && (
                        <div className={styles.BubbleMeta}>
                          <span className={styles.IntentBadge}>
                            {formatIntentLabel(messageItem.intent, t)}
                          </span>
                        </div>
                      )}

                      {messageItem.role === 'assistant' &&
                      messageItem.status === 'loading' ? (
                        <AgentTypingIndicator t={t} />
                      ) : messageItem.role === 'assistant' &&
                        messageItem.status === 'error' ? (
                        <AgentErrorState message={messageItem} t={t} />
                      ) : (
                        <MessageRichText content={messageItem.content} />
                      )}

                      {messageItem.role === 'assistant' &&
                        messageItem.status === 'sent' && (
                        <AgentArtifact
                          message={messageItem}
                          onPlayTracks={handlePlayTracks}
                          onFavoriteTrack={handleFavoriteTrack}
                          onAddTracksToPlaylist={handleAddTracksToPlaylist}
                          isConnected={isConnected}
                          isSpotifyPlaybackReady={isSpotifyPlaybackReady}
                          isAuthenticated={isAuthenticated}
                          artifactNotice={artifactNotices[messageItem.id] || ''}
                          isActionBusy={busyArtifactKey.endsWith(messageItem.id)}
                          t={t}
                        />
                        )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className={styles.EmptyState}>
                <div className={styles.QuickPrompts}>
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className={styles.Chip}
                      onClick={() => handlePromptClick(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div ref={messageEndRef} />
          </div>
        </div>

        <div className={styles.InputDock}>
          <form
            className={`${styles.Composer} ${styles.ChatColumn}`}
            onSubmit={(event) => {
              event.preventDefault()
              handleSend().catch(() => {})
            }}
          >
            <div className={styles.ComposerCard}>
              <div className={styles.ComposerField}>
                <textarea
                  ref={messageInputRef}
                  className={styles.Textarea}
                  value={message}
                  rows={1}
                  onChange={(event) => setMessage(event.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder=""
                />
                {error ? (
                  <p className={`${styles.StatusText} ${styles.ErrorText}`}>
                    {error}
                  </p>
                ) : null}
              </div>
              <button
                type="submit"
                className={styles.SendBtn}
                disabled={!message.trim() || isSending || isBootstrapping}
              >
                {isSending ? t('agent_sending') : t('agent_send')}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

export default AgentWorkbench

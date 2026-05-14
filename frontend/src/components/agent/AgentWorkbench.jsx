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

function getFeedbackKey(message) {
  return message.artifacts?.recommendationId || message.id || ''
}

function getSourcePlan(message) {
  return message.artifacts?.sourcePlan || null
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

function buildFriendlyToolSummary(message, t) {
  const sourcePlan = getSourcePlan(message)

  if (Array.isArray(sourcePlan?.steps) && sourcePlan.steps.length > 0) {
    return sourcePlan.steps
  }

  const labels = []
  const toolNames = Array.isArray(message.toolCalls)
    ? message.toolCalls.map((toolCall) => toolCall?.name || '').filter(Boolean)
    : []
  const pushLabel = (label) => {
    if (label && !labels.includes(label)) {
      labels.push(label)
    }
  }

  toolNames.forEach((name) => {
    if (
      name === 'library.list_audio_assets' ||
      name === 'library.search_local_audio'
    ) {
      pushLabel(t('agent_tool_summary_local'))
      return
    }

    if (
      name === 'spotify.search_tracks' ||
      name === 'spotify.get_user_top_tracks' ||
      name === 'spotify.get_user_top_artists'
    ) {
      pushLabel(t('agent_tool_summary_spotify'))
      return
    }

    if (
      name === 'player.play_local' ||
      name === 'player.play_spotify_uri' ||
      name === 'player.play_spotify_uris' ||
      name === 'player.replace_queue' ||
      name === 'player.append_queue'
    ) {
      pushLabel(t('agent_tool_summary_queue'))
      return
    }

    if (
      name === 'library.create_playlist' ||
      name === 'library.add_track_to_playlist'
    ) {
      pushLabel(t('agent_tool_summary_playlist'))
      return
    }

    if (name === 'library.favorite_track') {
      pushLabel(t('agent_tool_summary_favorite'))
    }
  })

  return labels
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
  onSubmitFeedback,
  feedbackState,
  isSubmittingFeedback,
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
  const feedbackKey = getFeedbackKey(message)
  const playlist = artifacts.playlist || null
  const sourcePlan = getSourcePlan(message)
  const toolSummary = buildFriendlyToolSummary(message, t)
  const canPlayArtifactTracks = tracks.length > 0 && hasPrimaryPlayableTracks(tracks)
  const primaryTrack = artifacts.track || tracks[0] || null

  return (
    <>
      {sourcePlan && (
        <div className={styles.SourcePlanCard}>
          <p className={styles.SectionLabel}>{t('agent_source_plan_title')}</p>
          <p className={styles.SourcePlanSummary}>{sourcePlan.summary}</p>
          {Array.isArray(sourcePlan.sources) && sourcePlan.sources.length > 0 && (
            <div className={styles.SourceChipRow}>
              {sourcePlan.sources.map((source) => (
                <span
                  key={`${message.id}-${source.type}-${source.label}`}
                  className={styles.SourceChip}
                >
                  {source.label}
                  {source.count > 0 ? ` · ${source.count}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
              {recommendationSet?.summary &&
                recommendationSet.summary !== sourcePlan?.summary && (
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

          {toolSummary.length > 0 && (
            <div className={styles.ToolSummaryBox}>
              <p className={styles.SectionLabel}>{t('agent_tool_summary_title')}</p>
              <div className={styles.ToolSummaryList}>
                {toolSummary.slice(0, 4).map((item) => (
                  <span key={`${feedbackKey}-${item}`} className={styles.ToolSummaryItem}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {artifactNotice && (
            <p className={styles.ActionNotice}>{artifactNotice}</p>
          )}
        </div>
      )}

      {artifacts.recommendationId && (
        <div className={styles.FeedbackRow}>
          <button
            type="button"
            className={`${styles.FeedbackBtn} ${
              feedbackState === 'like' ? styles.FeedbackActive : ''
            }`}
            disabled={isSubmittingFeedback}
            onClick={() =>
              onSubmitFeedback(message, {
                recommendationId: artifacts.recommendationId,
                feedback: 'like',
              })
            }
          >
            {t('agent_feedback_like')}
          </button>
          <button
            type="button"
            className={`${styles.FeedbackBtn} ${
              feedbackState === 'dislike' ? styles.FeedbackActive : ''
            }`}
            disabled={isSubmittingFeedback}
            onClick={() =>
              onSubmitFeedback(message, {
                recommendationId: artifacts.recommendationId,
                feedback: 'dislike',
              })
            }
          >
            {t('agent_feedback_dislike')}
          </button>
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
    feedbackMap,
    isBootstrapping,
    isSending,
    isSubmittingFeedback,
    loadConversation,
    sendMessage,
    startNewConversation,
    submitFeedback,
  } = useAgent()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)
  const [message, setMessage] = useState('')
  const [artifactNotices, setArtifactNotices] = useState({})
  const [busyArtifactKey, setBusyArtifactKey] = useState('')
  const messageEndRef = useRef(null)

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

    setMessage('')
  }

  function handlePromptClick(prompt) {
    handleSend(prompt).catch(() => {})
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

  async function handleFeedback(messageItem, payload) {
    await submitFeedback({
      ...payload,
      conversationId: currentConversation.id,
      messageId: messageItem.id,
      note: messageItem.content?.slice(0, 120) || '',
      metadata: {
        source: 'agent-workbench',
      },
    })
  }

  const identityLabel = isAuthenticated
    ? user?.displayName || user?.email || t('appName')
    : t('agent_guest_label')
  const modeLabel = !isAuthenticated
    ? t('mode_guest')
    : isConnected
      ? t('mode_spotify_enhanced')
      : t('mode_local')
  const modeDescription = !isAuthenticated
    ? t('agent_guest_body')
    : isConnected
      ? t('agent_spotify_unlocked_body')
      : t('agent_spotify_locked_body')

  return (
    <div className={styles.Shell}>
      <aside className={styles.Sidebar}>
        <div className={styles.SidebarHeader}>
          <div>
            <p className={styles.Eyebrow}>{t('agent_conversations')}</p>
            <h2 className={styles.Title}>{t('agent_title')}</h2>
            <p className={styles.Subtitle}>{t('agent_subtitle')}</p>
          </div>
          <button
            type="button"
            className={styles.SecondaryBtn}
            onClick={startNewConversation}
          >
            {t('agent_new_chat')}
          </button>
        </div>

        <div className={styles.SummaryCard}>
          <p className={styles.Eyebrow}>{t('agent_mode_title')}</p>
          <strong className={styles.ConversationTitle}>{modeLabel}</strong>
          <p className={styles.NowPlaying}>{modeDescription}</p>
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
          <div>
            <p className={styles.Eyebrow}>{t('agent_workspace')}</p>
            <h2 className={styles.Title}>
              {currentConversation.title || t('agent_empty_title')}
            </h2>
            <div className={styles.HeaderMeta}>
              <span className={styles.Pill}>
                {isSending ? t('agent_working') : t('agent_ready')}
              </span>
              <span className={styles.Pill}>
                {isPlaying ? t('agent_player_playing') : t('agent_player_paused')}
              </span>
              <span className={styles.Pill}>{identityLabel}</span>
              <span className={styles.Pill}>
                {isConnected ? t('spotify_connected') : t('spotify_not_connected')}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.Messages}>
          {currentConversation.messages?.length ? (
            currentConversation.messages.map((messageItem) => {
              const feedbackKey = getFeedbackKey(messageItem)
              const feedbackState = feedbackMap[feedbackKey] || ''

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
                    <div className={styles.BubbleMeta}>
                      <span>
                        {messageItem.role === 'user'
                          ? t('agent_role_user')
                          : t('agent_role_agent')}
                      </span>
                      {messageItem.intent && (
                        <span className={styles.IntentBadge}>
                          {formatIntentLabel(messageItem.intent, t)}
                        </span>
                      )}
                    </div>

                    <p className={styles.BubbleText}>{messageItem.content}</p>

                    {messageItem.role === 'assistant' && (
                      <AgentArtifact
                        message={messageItem}
                        onPlayTracks={handlePlayTracks}
                        onFavoriteTrack={handleFavoriteTrack}
                        onAddTracksToPlaylist={handleAddTracksToPlaylist}
                        onSubmitFeedback={(targetMessage, payload) =>
                          handleFeedback(targetMessage, payload).catch(() => {})
                        }
                        feedbackState={feedbackState}
                        isSubmittingFeedback={isSubmittingFeedback}
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
              <h3 className={styles.EmptyTitle}>{t('agent_empty_title')}</h3>
              <p className={styles.EmptyText}>
                {isAuthenticated ? t('agent_empty_hint') : t('agent_guest_body')}
              </p>
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

        <form
          className={styles.Composer}
          onSubmit={(event) => {
            event.preventDefault()
            handleSend().catch(() => {})
          }}
        >
          <div>
            <textarea
              className={styles.Textarea}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t('agent_message_placeholder')}
            />
            <p className={`${styles.StatusText} ${error ? styles.ErrorText : ''}`}>
              {error ||
                (isAuthenticated
                  ? t('agent_input_hint')
                  : t('agent_guest_saved_note'))}
            </p>
          </div>
          <button
            type="submit"
            className={styles.SendBtn}
            disabled={isSending || isBootstrapping}
          >
            {isSending ? t('agent_sending') : t('agent_send')}
          </button>
        </form>
      </section>
    </div>
  )
}

export default AgentWorkbench

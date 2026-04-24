import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { useAgent } from '../../context/AgentContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
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
    case 'generate_recommendation':
    default:
      return t('agent_intent_recommend')
  }
}

function getFeedbackKey(message) {
  return message.artifacts?.recommendationId || message.id || ''
}

function canPlayTracks(tracks = []) {
  return tracks.some((track) => track.previewUrl || track.preview_url)
}

function AgentArtifact({
  message,
  onPlayTracks,
  onSubmitFeedback,
  feedbackState,
  isSubmittingFeedback,
  t,
}) {
  const artifacts = message.artifacts || {}
  const tracks = artifacts.tracks || artifacts.topTracks || []
  const feedbackKey = getFeedbackKey(message)

  return (
    <>
      {(artifacts.track || artifacts.artist || artifacts.album || tracks.length > 0) && (
        <div className={styles.ArtifactBox}>
          <div className={styles.ArtifactHeader}>
            <p className={styles.ArtifactTitle}>
              {artifacts.recommendationTitle ||
                artifacts.track?.name ||
                artifacts.artist?.name ||
                artifacts.album?.name ||
                t('agent_tracks')}
            </p>
            {tracks.length > 0 && canPlayTracks(tracks) && (
              <button
                type="button"
                className={styles.ActionBtn}
                onClick={() =>
                  onPlayTracks(tracks, {
                    playlistId:
                      artifacts.recommendationId || `agent-message-${message.id}`,
                    playlistTitle:
                      artifacts.recommendationTitle || t('agent_queue_title'),
                  })
                }
              >
                {t('agent_play_recommendation')}
              </button>
            )}
          </div>

          {artifacts.track && (
            <div className={styles.TrackRow}>
              <div>
                <span className={styles.TrackName}>{artifacts.track.name}</span>
                <span className={styles.TrackArtist}>
                  {artifacts.track.artists?.join(', ') || t('appName')}
                </span>
              </div>
              <span className={styles.TrackTag}>
                {artifacts.track.previewUrl
                  ? t('agent_listenable')
                  : t('agent_not_listenable')}
              </span>
            </div>
          )}

          {artifacts.artist && (
            <div className={styles.TrackRow}>
              <div>
                <span className={styles.TrackName}>{artifacts.artist.name}</span>
                <span className={styles.TrackArtist}>
                  {(artifacts.artist.genres || []).slice(0, 3).join(', ') ||
                    t('artists')}
                </span>
              </div>
              <span className={styles.TrackTag}>
                {t('agent_artist_popularity', {
                  popularity: artifacts.artist.popularity || 0,
                })}
              </span>
            </div>
          )}

          {artifacts.album && (
            <div className={styles.TrackRow}>
              <div>
                <span className={styles.TrackName}>{artifacts.album.name}</span>
                <span className={styles.TrackArtist}>
                  {artifacts.album.artists?.join(', ') || t('albums')}
                </span>
              </div>
              <span className={styles.TrackTag}>
                {artifacts.album.releaseDate || t('albums')}
              </span>
            </div>
          )}

          {tracks.length > 0 && (
            <div className={styles.TrackList}>
              {tracks.slice(0, 5).map((track) => (
                <div key={track.id} className={styles.TrackRow}>
                  <div>
                    <span className={styles.TrackName}>{track.name}</span>
                    <span className={styles.TrackArtist}>
                      {track.artists?.join(', ') || t('appName')}
                    </span>
                  </div>
                  <span className={styles.TrackTag}>
                    {track.previewUrl || track.preview_url
                      ? t('agent_listenable')
                      : t('agent_not_listenable')}
                  </span>
                </div>
              ))}
            </div>
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
  onPrefilledPromptConsumed = undefined,
}) {
  const dispatch = useDispatch()
  const { t } = useTranslation()
  const { isAuthenticated, isLoading, login, profile } = useSpotify()
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

    setMessage(prefilledPrompt)
    onPrefilledPromptConsumed?.()
  }, [onPrefilledPromptConsumed, prefilledPrompt])

  async function handleSend(inputMessage) {
    const nextMessage = String(inputMessage || message).trim()

    if (!nextMessage) {
      return
    }

    const response = await sendMessage({
      message: nextMessage,
      context: {
        currentTrackId: trackData.source === 'spotify' || trackData.source === 'agent'
          ? trackData.id
          : '',
        currentPlaylistId: trackData.playlistId || '',
        playerState: isPlaying ? 'playing' : 'paused',
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

  function handlePlayTracks(tracks, options) {
    dispatch(
      startAgentPlayback({
        tracks,
        playlistId: options.playlistId,
        playlistTitle: options.playlistTitle,
      }),
    )
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

  if (!isAuthenticated) {
    return (
      <div className={styles.LoginCard}>
        <p className={styles.Eyebrow}>{t('agent_title')}</p>
        <h2 className={styles.Title}>{t('agent_login_title')}</h2>
        <p className={styles.Subtitle}>{t('agent_login_body')}</p>
        <button type="button" className={styles.PrimaryBtn} onClick={login}>
          {t('agent_login_cta')}
        </button>
      </div>
    )
  }

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
          <p className={styles.Eyebrow}>{t('agent_now_playing')}</p>
          <strong className={styles.ConversationTitle}>
            {trackData.trackName || t('appName')}
          </strong>
          <p className={styles.NowPlaying}>
            {(trackData.trackArtist || profile?.display_name || t('appName'))}
          </p>
        </div>

        <div className={styles.ConversationList}>
          {isBootstrapping ? (
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
                {isLoading ? t('agent_working') : t('agent_ready')}
              </span>
              <span className={styles.Pill}>
                {isPlaying ? t('agent_player_playing') : t('agent_player_paused')}
              </span>
              <span className={styles.Pill}>
                {profile?.display_name || t('appName')}
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
                        onSubmitFeedback={(targetMessage, payload) =>
                          handleFeedback(targetMessage, payload).catch(() => {})
                        }
                        feedbackState={feedbackState}
                        isSubmittingFeedback={isSubmittingFeedback}
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
              <p className={styles.EmptyText}>{t('agent_empty_hint')}</p>
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
              {error || t('agent_input_hint')}
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

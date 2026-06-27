import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useAgent } from '../../context/AgentContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSpotify } from '../../context/SpotifyContext.jsx'
import styles from './agent-preview-card.module.css'

function AgentPreviewCard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isAuthenticated, openAuthDialog, user } = useAuth()
  const { connect, isConnected, profile } = useSpotify()
  const { conversations, currentConversation, startNewConversation } = useAgent()
  const trackData = useSelector((state) => state.player.trackData)
  const isPlaying = useSelector((state) => state.player.isPlaying)

  const quickPrompts = useMemo(
    () => [
      t('agent_quick_prompt_1'),
      t('agent_quick_prompt_2'),
      t('agent_quick_prompt_3'),
    ],
    [t],
  )

  function openAgent(prompt = '', autoSend = false) {
    if (prompt) {
      startNewConversation()
      navigate('/agent', { state: { prompt, autoSend } })
      return
    }

    navigate('/agent')
  }

  return (
    <div className={styles.Card}>
      <div className={styles.Content}>
        <p className={styles.Eyebrow}>{t('agent_title')}</p>
        <h2 className={styles.Title}>{t('agent_preview_title')}</h2>

        <div className={styles.Actions}>
          <button
            type="button"
            className={styles.PrimaryBtn}
            onClick={() => openAgent()}
          >
            {t('agent_open_workspace')}
          </button>
          {isAuthenticated ? (
            currentConversation?.id ? (
              <button
                type="button"
                className={styles.SecondaryBtn}
                onClick={() => openAgent()}
              >
                {t('agent_continue_conversation')}
              </button>
            ) : !isConnected ? (
              <button
                type="button"
                className={styles.SecondaryBtn}
                onClick={() => connect('/')}
              >
                {t('spotify_connect')}
              </button>
            ) : null
          ) : (
            <button
              type="button"
              className={styles.SecondaryBtn}
              onClick={() => openAuthDialog('login')}
            >
              {t('agent_guest_cta')}
            </button>
          )}
        </div>

        <div className={styles.QuickPrompts}>
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className={styles.PromptBtn}
              onClick={() => openAgent(prompt, true)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.Stats}>
        <div className={styles.StatCard}>
          <span className={styles.StatLabel}>{t('agent_preview_conversations')}</span>
          <span className={styles.StatValue}>{conversations.length}</span>
          <p className={styles.StatText}>
            {isAuthenticated
              ? currentConversation?.title || t('agent_no_conversations')
              : t('agent_guest_label')}
          </p>
        </div>

        <div className={styles.StatCard}>
          <span className={styles.StatLabel}>{t('agent_now_playing')}</span>
          <span className={styles.StatValue}>{trackData.trackName || '...'}</span>
          <p className={styles.StatText}>
            {trackData.trackArtist ||
              profile?.display_name ||
              user?.displayName ||
              t('appName')}
          </p>
          <div className={styles.StatusRow}>
            <span className={styles.Pill}>
              {isPlaying ? t('agent_player_playing') : t('agent_player_paused')}
            </span>
            <span className={styles.Pill}>
              {isConnected ? t('spotify_connected') : t('spotify_not_connected')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentPreviewCard

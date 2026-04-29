import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AgentWorkbench from '../components/agent/AgentWorkbench'
import styles from './agent.module.css'

function AgentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [prefilledPrompt, setPrefilledPrompt] = useState('')
  const [autoSendPrefilledPrompt, setAutoSendPrefilledPrompt] = useState(false)

  useEffect(() => {
    if (!location.state?.prompt) {
      return
    }

    setPrefilledPrompt(location.state.prompt)
    setAutoSendPrefilledPrompt(Boolean(location.state.autoSend))
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  return (
    <div className={styles.AgentPage}>
      <div className={styles.Glow} />
      <div className={styles.Bg} />
      <div className={styles.Content}>
        <AgentWorkbench
          prefilledPrompt={prefilledPrompt}
          autoSendPrefilledPrompt={autoSendPrefilledPrompt}
          onPrefilledPromptConsumed={() => {
            setPrefilledPrompt('')
            setAutoSendPrefilledPrompt(false)
          }}
        />
      </div>
    </div>
  )
}

export default AgentPage

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AgentWorkbench from '../components/agent/AgentWorkbench'
import Topnav from '../components/topnav/Topnav'
import styles from './agent.module.css'

function AgentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [prefilledPrompt, setPrefilledPrompt] = useState('')

  useEffect(() => {
    if (!location.state?.prompt) {
      return
    }

    setPrefilledPrompt(location.state.prompt)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.pathname, location.state, navigate])

  return (
    <div className={styles.AgentPage}>
      <div className={styles.Glow} />
      <div className={styles.Bg} />
      <Topnav />
      <div className={styles.Content}>
        <AgentWorkbench
          prefilledPrompt={prefilledPrompt}
          onPrefilledPromptConsumed={() => setPrefilledPrompt('')}
        />
      </div>
    </div>
  )
}

export default AgentPage

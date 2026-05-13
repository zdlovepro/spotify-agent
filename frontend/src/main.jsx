import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { AgentProvider } from './context/AgentContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { SpotifyPlaybackProvider } from './context/SpotifyPlaybackContext.jsx'
import { SpotifyProvider } from './context/SpotifyContext.jsx'
import { store } from './store/index.js'
import App from './App.jsx'
import './i18n'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <SpotifyProvider>
          <SpotifyPlaybackProvider>
            <AgentProvider>
              <App />
            </AgentProvider>
          </SpotifyPlaybackProvider>
        </SpotifyProvider>
      </AuthProvider>
    </Provider>
  </StrictMode>,
)

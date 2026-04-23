import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  BACKEND_BASE_URL,
  clearStoredSession,
  getStoredSession,
  mapSpotifyPlaylist,
  mapSpotifyPlaylistDetails,
  readSessionFromSearch,
  refreshSpotifySession,
  sessionNeedsRefresh,
  spotifyApiRequest,
  storeSession,
} from '../lib/spotify.js'

const SpotifyContext = createContext(null)

export function SpotifyProvider({ children }) {
  const [session, setSession] = useState(() => getStoredSession())
  const [profile, setProfile] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [playlistCache, setPlaylistCache] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const logout = useCallback(() => {
    clearStoredSession()
    setSession(null)
    setProfile(null)
    setPlaylists([])
    setPlaylistCache({})
    setError('')
  }, [])

  const ensureValidSession = useCallback(async (currentSession) => {
    if (!currentSession) {
      return null
    }

    if (!sessionNeedsRefresh(currentSession)) {
      return currentSession
    }

    const refreshedSession = await refreshSpotifySession(currentSession)
    storeSession(refreshedSession)
    setSession(refreshedSession)

    return refreshedSession
  }, [])

  const request = useCallback(
    async (path) => {
      const activeSession = await ensureValidSession(session)

      if (!activeSession) {
        throw new Error('No active Spotify session')
      }

      return spotifyApiRequest(path, activeSession)
    },
    [ensureValidSession, session],
  )

  const getPlaylistDetails = useCallback(
    async (playlistId) => {
      if (playlistCache[playlistId]) {
        return playlistCache[playlistId]
      }

      const data = await request(`/api/spotify/playlists/${playlistId}`)
      const mappedPlaylist = mapSpotifyPlaylistDetails(data)

      setPlaylistCache((currentCache) => ({
        ...currentCache,
        [playlistId]: mappedPlaylist,
      }))

      return mappedPlaylist
    },
    [playlistCache, request],
  )

  const login = useCallback(() => {
    window.location.href = `${BACKEND_BASE_URL}/api/auth/login`
  }, [])

  useEffect(() => {
    const { session: callbackSession, error: callbackError } =
      readSessionFromSearch(window.location.search)

    if (!callbackSession && !callbackError) {
      return
    }

    window.history.replaceState({}, document.title, window.location.pathname)

    if (callbackError) {
      setError(callbackError)
      return
    }

    if (callbackSession) {
      storeSession(callbackSession)
      setSession(callbackSession)
      setError('')
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false

    async function bootstrap() {
      setIsLoading(true)

      try {
        const [profileData, playlistData] = await Promise.all([
          request('/api/spotify/me'),
          request('/api/spotify/playlists?limit=20'),
        ])

        if (cancelled) {
          return
        }

        setProfile(profileData)
        setPlaylists((playlistData.items || []).map(mapSpotifyPlaylist))
        setError('')
      } catch (err) {
        if (cancelled) {
          return
        }

        setError(err.message)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    bootstrap()

    return () => {
      cancelled = true
    }
  }, [request, session])

  useEffect(() => {
    if (error === 'No active Spotify session') {
      logout()
    }
  }, [error, logout])

  return (
    <SpotifyContext.Provider
      value={{
        error,
        getPlaylistDetails,
        isAuthenticated: Boolean(session?.accessToken),
        isLoading,
        login,
        logout,
        playlists,
        profile,
      }}
    >
      {children}
    </SpotifyContext.Provider>
  )
}

export function useSpotify() {
  return useContext(SpotifyContext)
}

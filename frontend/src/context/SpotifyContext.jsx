import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useAuth } from './AuthContext.jsx'
import { BACKEND_BASE_URL } from '../utils/api.js'
import {
  mapSpotifyPlaylist,
  mapSpotifyPlaylistDetails,
} from '../lib/spotify.js'

const SpotifyContext = createContext(null)

function readProviderCallback(search) {
  const params = new URLSearchParams(search)

  if (params.get('provider') !== 'spotify') {
    return null
  }

  return {
    connected: params.get('connected') === '1',
    error: params.get('error') || '',
  }
}

export function SpotifyProvider({ children }) {
  const {
    isAuthenticated: isLocalAuthenticated,
    request: authRequest,
    user,
  } = useAuth()
  const [connection, setConnection] = useState(null)
  const [profile, setProfile] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [playlistCache, setPlaylistCache] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const clearSpotifyState = useCallback(() => {
    setConnection(null)
    setProfile(null)
    setPlaylists([])
    setPlaylistCache({})
  }, [])

  const refreshConnectionState = useCallback(async () => {
    if (!isLocalAuthenticated) {
      clearSpotifyState()
      setError('')
      setIsLoading(false)
      return null
    }

    try {
      const data = await authRequest('/api/providers')
      const spotifyLink = (data.items || []).find((item) => item.provider === 'spotify')

      setConnection(spotifyLink || null)
      setError('')
      return spotifyLink || null
    } catch (requestError) {
      clearSpotifyState()
      setError(requestError.message)
      return null
    }
  }, [authRequest, clearSpotifyState, isLocalAuthenticated])

  const connect = useCallback(
    async (returnTo = window.location.pathname) => {
      if (!isLocalAuthenticated) {
        setError('Sign in to AgentMusic first')
        return
      }

      try {
        const params = new URLSearchParams({
          return_to: returnTo || '/',
          format: 'json',
        })
        const data = await authRequest(
          `/api/providers/spotify/connect?${params.toString()}`,
        )

        if (!data?.authorizeUrl) {
          throw new Error('Spotify authorize URL is unavailable')
        }

        setError('')
        window.location.href = data.authorizeUrl
      } catch (requestError) {
        setError(requestError.message)
        throw requestError
      }
    },
    [authRequest, isLocalAuthenticated],
  )

  const disconnect = useCallback(async () => {
    if (!isLocalAuthenticated) {
      return
    }

    try {
      await authRequest('/api/providers/spotify/disconnect', {
        method: 'DELETE',
      })
      clearSpotifyState()
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [authRequest, clearSpotifyState, isLocalAuthenticated])

  const request = useCallback(
    async (path, options = {}) => {
      if (!isLocalAuthenticated) {
        throw new Error('Local sign-in required')
      }

      if (!connection?.connected) {
        throw new Error('Spotify connection required')
      }

      return authRequest(path, options)
    },
    [authRequest, connection?.connected, isLocalAuthenticated],
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

  useEffect(() => {
    const callbackState = readProviderCallback(window.location.search)

    if (!callbackState) {
      return
    }

    window.history.replaceState({}, document.title, window.location.pathname)

    if (callbackState.error) {
      setError(callbackState.error)
      return
    }

    if (callbackState.connected) {
      refreshConnectionState().catch(() => {})
    }
  }, [refreshConnectionState])

  useEffect(() => {
    refreshConnectionState().catch(() => {})
  }, [refreshConnectionState, user?.id])

  useEffect(() => {
    if (!isLocalAuthenticated || !connection?.connected) {
      setProfile(null)
      setPlaylists([])
      setPlaylistCache({})
      return
    }

    let cancelled = false

    async function bootstrap() {
      setIsLoading(true)

      try {
        const [profileData, playlistData] = await Promise.all([
          authRequest('/api/spotify/me'),
          authRequest('/api/spotify/playlists?limit=20'),
        ])

        if (cancelled) {
          return
        }

        setProfile(profileData)
        setPlaylists((playlistData.items || []).map(mapSpotifyPlaylist))
        setError('')
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message)
          setProfile(null)
          setPlaylists([])
          setPlaylistCache({})
        }
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
  }, [authRequest, connection?.connected, isLocalAuthenticated])

  const value = useMemo(
    () => ({
      connection,
      connect,
      disconnect,
      error,
      getPlaylistDetails,
      isAuthenticated: Boolean(connection?.connected),
      isConnected: Boolean(connection?.connected),
      isLoading,
      login: connect,
      logout: disconnect,
      playlists,
      profile,
      refreshConnectionState,
      request,
    }),
    [
      connect,
      connection,
      disconnect,
      error,
      getPlaylistDetails,
      isLoading,
      playlists,
      profile,
      refreshConnectionState,
      request,
    ],
  )

  return (
    <SpotifyContext.Provider value={value}>{children}</SpotifyContext.Provider>
  )
}

export function useSpotify() {
  return useContext(SpotifyContext)
}

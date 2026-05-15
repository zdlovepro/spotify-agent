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
  resolveTrackPlaybackMeta,
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
    openAuthDialog,
    request: authRequest,
    user,
  } = useAuth()
  const [connection, setConnection] = useState(null)
  const [profile, setProfile] = useState(null)
  const [playlists, setPlaylists] = useState([])
  const [playlistCache, setPlaylistCache] = useState({})
  const [devices, setDevices] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const clearSpotifyState = useCallback(() => {
    setConnection(null)
    setProfile(null)
    setPlaylists([])
    setPlaylistCache({})
    setDevices([])
  }, [])

  const buildCurrentReturnTo = useCallback(() => {
    if (typeof window === 'undefined') {
      return '/'
    }

    const pathname = window.location.pathname || '/'
    const search = window.location.search || ''
    const hash = window.location.hash || ''

    return `${pathname}${search}${hash}` || '/'
  }, [])

  const refreshConnectionState = useCallback(async () => {
    if (!isLocalAuthenticated) {
      clearSpotifyState()
      setError('')
      setNotice('')
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
    async (returnTo = '') => {
      const resolvedReturnTo =
        typeof returnTo === 'string' && returnTo.trim().startsWith('/')
          ? returnTo.trim()
          : buildCurrentReturnTo()

      if (!isLocalAuthenticated) {
        setNotice('')
        setError('Please sign in to your AgentMusic account first.')
        openAuthDialog('login')
        return null
      }

      try {
        const params = new URLSearchParams({
          return_to: resolvedReturnTo,
          format: 'json',
        })
        const data = await authRequest(
          `/api/providers/spotify/connect?${params.toString()}`,
        )

        if (!data?.authorizeUrl) {
          throw new Error('Spotify authorize URL is unavailable')
        }

        setError('')
        setNotice('')
        window.location.href = data.authorizeUrl
        return data.authorizeUrl
      } catch (requestError) {
        const isLocalAuthError =
          requestError?.status === 401 ||
          requestError?.payload?.code === 'local_user_required'

        if (isLocalAuthError) {
          setNotice('')
          setError('Please sign in to your AgentMusic account first.')
          openAuthDialog('login')
        } else {
          setError(requestError.message)
        }

        throw requestError
      }
    },
    [authRequest, buildCurrentReturnTo, isLocalAuthenticated, openAuthDialog],
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
      setNotice('spotify_disconnect_success')
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

  const refreshDevices = useCallback(async () => {
    if (!isLocalAuthenticated || !connection?.connected) {
      setDevices([])
      return []
    }

    try {
      const data = await authRequest('/api/spotify/player/devices')
      const nextDevices = Array.isArray(data?.devices)
        ? data.devices
        : Array.isArray(data?.items)
          ? data.items
          : []
      setDevices(nextDevices)
      setError('')
      return nextDevices
    } catch (requestError) {
      setDevices([])
      setError(requestError.message)
      return []
    }
  }, [authRequest, connection?.connected, isLocalAuthenticated])

  const resumeRemotePlayback = useCallback(async (options = {}) => {
    const data = await request('/api/spotify/player/play', {
      method: 'PUT',
      body:
        options.deviceId || options.positionMs !== undefined
          ? {
              ...(options.deviceId ? { deviceId: options.deviceId } : {}),
              ...(options.positionMs !== undefined
                ? { positionMs: options.positionMs }
                : {}),
            }
          : {},
    })

    await refreshDevices()
    return data
  }, [refreshDevices, request])

  const pauseRemotePlayback = useCallback(async (options = {}) => {
    const data = await request('/api/spotify/player/pause', {
      method: 'PUT',
      body: options.deviceId ? { deviceId: options.deviceId } : {},
    })

    await refreshDevices()
    return data
  }, [refreshDevices, request])

  const playRemoteQueue = useCallback(
    async (queue = [], startIndex = 0, options = {}) => {
      const remoteQueue = (Array.isArray(queue) ? queue : [])
        .map((track, index) => ({
          index,
          remoteUri: resolveTrackPlaybackMeta(track).remoteUri,
        }))
        .filter((track) => track.remoteUri)

      if (!remoteQueue.length) {
        throw new Error('No Spotify tracks are available for remote playback')
      }

      const matchingIndex = remoteQueue.findIndex(
        (track) => track.index === startIndex,
      )
      const offsetPosition = matchingIndex >= 0 ? matchingIndex : 0

      const data = await request('/api/spotify/player/play', {
        method: 'PUT',
        body: {
          ...(options.deviceId ? { deviceId: options.deviceId } : {}),
          uris: remoteQueue.map((track) => track.remoteUri),
          offset: {
            position: offsetPosition,
          },
        },
      })

      await refreshDevices()
      return data
    },
    [refreshDevices, request],
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
      setNotice('')
      return
    }

    if (callbackState.connected) {
      refreshConnectionState()
        .then((spotifyLink) => {
          if (spotifyLink?.connected || spotifyLink?.provider === 'spotify') {
            setError('')
            setNotice('spotify_connect_success')
          }
        })
        .catch(() => {})
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
      setDevices([])
      return
    }

    let cancelled = false

    async function bootstrap() {
      setIsLoading(true)

      try {
        const [profileResult, playlistResult, deviceResult] = await Promise.allSettled([
          authRequest('/api/spotify/me'),
          authRequest('/api/spotify/playlists?limit=20'),
          authRequest('/api/spotify/player/devices'),
        ])

        if (
          profileResult.status !== 'fulfilled' ||
          playlistResult.status !== 'fulfilled'
        ) {
          throw new Error(
            profileResult.status === 'rejected'
              ? profileResult.reason?.message || 'spotify_profile_failed'
              : playlistResult.reason?.message || 'spotify_playlists_failed',
          )
        }

        if (cancelled) {
          return
        }

        setProfile(profileResult.value)
        setPlaylists((playlistResult.value.items || []).map(mapSpotifyPlaylist))
        setDevices(
          deviceResult.status === 'fulfilled' && Array.isArray(deviceResult.value?.devices)
            ? deviceResult.value.devices
            : [],
        )
        setError('')
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message)
          setProfile(null)
          setPlaylists([])
          setPlaylistCache({})
          setDevices([])
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
      devices,
      error,
      getPlaylistDetails,
      isAuthenticated: Boolean(connection?.connected),
      isConnected: Boolean(connection?.connected),
      isLoading,
      login: connect,
      notice,
      logout: disconnect,
      playlists,
      playRemoteQueue,
      profile,
      pauseRemotePlayback,
      refreshConnectionState,
      refreshDevices,
      resumeRemotePlayback,
      request,
    }),
    [
      connect,
      connection,
      disconnect,
      devices,
      error,
      getPlaylistDetails,
      isLoading,
      playlists,
      playRemoteQueue,
      profile,
      pauseRemotePlayback,
      notice,
      refreshConnectionState,
      refreshDevices,
      resumeRemotePlayback,
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

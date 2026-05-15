import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './AuthContext.jsx'
import { useSpotify } from './SpotifyContext.jsx'

const SpotifyPlaybackContext = createContext(null)
const SPOTIFY_SDK_URL = 'https://sdk.scdn.co/spotify-player.js'
const WEB_PLAYER_NAME = 'AgentMusic Web Player'
let spotifySdkPromise = null

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function createPlaybackError(message, code = 'spotify_playback_failed') {
  const error = new Error(message)
  error.code = code
  return error
}

function loadSpotifyWebPlaybackSdk() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      createPlaybackError('Spotify Web Playback SDK is unavailable in this environment.'),
    )
  }

  if (window.Spotify?.Player) {
    return Promise.resolve(window.Spotify)
  }

  if (spotifySdkPromise) {
    return spotifySdkPromise
  }

  spotifySdkPromise = new Promise((resolve, reject) => {
    let settled = false

    const resolveSdk = () => {
      if (settled) {
        return
      }

      settled = true
      resolve(window.Spotify)
    }

    const rejectSdk = () => {
      if (settled) {
        return
      }

      settled = true
      spotifySdkPromise = null
      reject(
        createPlaybackError('Unable to load Spotify Web Playback SDK.'),
      )
    }

    const previousReady = window.onSpotifyWebPlaybackSDKReady

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (typeof previousReady === 'function') {
        previousReady()
      }

      resolveSdk()
    }

    const existingScript = document.querySelector(`script[src="${SPOTIFY_SDK_URL}"]`)

    if (existingScript) {
      existingScript.addEventListener('error', rejectSdk, { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = SPOTIFY_SDK_URL
    script.async = true
    script.addEventListener('error', rejectSdk, { once: true })
    document.head.appendChild(script)
  })

  return spotifySdkPromise
}

function mapSpotifyPlaybackError(error, fallbackMessage = 'Spotify playback is unavailable.') {
  const code =
    error?.payload?.code ||
    error?.code ||
    'spotify_playback_failed'
  const message =
    error?.payload?.error ||
    error?.message ||
    fallbackMessage

  return {
    code,
    message,
  }
}

export function SpotifyPlaybackProvider({ children }) {
  const { isAuthenticated: isLocalAuthenticated, request: authRequest } = useAuth()
  const {
    connection,
    isConnected,
    profile,
    refreshDevices: refreshSpotifyDevices,
  } = useSpotify()
  const [deviceId, setDeviceId] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const playerRef = useRef(null)
  const deviceIdRef = useRef('')

  const spotifyProduct = normalizeString(
    profile?.product || connection?.profile?.product,
  ).toLowerCase()

  const applyPlaybackError = useCallback((nextError, fallbackMessage) => {
    const normalized = mapSpotifyPlaybackError(nextError, fallbackMessage)
    setError(normalized.message)
    setErrorCode(normalized.code)
    return normalized
  }, [])

  const clearPlaybackError = useCallback(() => {
    setError('')
    setErrorCode('')
  }, [])

  useEffect(() => {
    deviceIdRef.current = deviceId
  }, [deviceId])

  const resetPlaybackState = useCallback(() => {
    setDeviceId('')
    setIsReady(false)
    setIsActive(false)
    setIsConnecting(false)
  }, [])

  const disconnectPlayer = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.disconnect()
      playerRef.current = null
    }
  }, [])

  const fetchSdkToken = useCallback(async () => {
    const data = await authRequest('/api/spotify/sdk-token')

    if (!data?.accessToken) {
      throw createPlaybackError('Spotify Web Playback token is unavailable.')
    }

    return data.accessToken
  }, [authRequest])

  const refreshDevices = useCallback(async () => {
    if (!isLocalAuthenticated || !isConnected) {
      setIsActive(false)
      return []
    }

    try {
      const devices = await refreshSpotifyDevices()
      const matchingDevice = deviceIdRef.current
        ? devices.find((device) => device.id === deviceIdRef.current)
        : null

      setIsActive(Boolean(matchingDevice?.isActive))

      if (matchingDevice) {
        clearPlaybackError()
      }

      if (!matchingDevice && deviceIdRef.current) {
        setError('No available Spotify playback device found for the web player.')
        setErrorCode('spotify_no_active_device')
      }

      return devices
    } catch (requestError) {
      applyPlaybackError(
        requestError,
        'Unable to refresh Spotify playback devices.',
      )
      setIsActive(false)
      return []
    }
  }, [
    applyPlaybackError,
    clearPlaybackError,
    isConnected,
    isLocalAuthenticated,
    refreshSpotifyDevices,
  ])

  const transferPlaybackToWebPlayer = useCallback(
    async (nextDeviceId, play = false) => {
      if (!nextDeviceId) {
        return null
      }

      try {
        const data = await authRequest('/api/spotify/player/transfer', {
          method: 'PUT',
          body: {
            deviceId: nextDeviceId,
            play,
          },
        })

        clearPlaybackError()
        setIsActive(true)
        await refreshDevices()
        return data
      } catch (requestError) {
        applyPlaybackError(
          requestError,
          'Unable to transfer Spotify playback to the web player.',
        )
        setIsActive(false)
        throw requestError
      }
    },
    [applyPlaybackError, authRequest, clearPlaybackError, refreshDevices],
  )

  const activatePlayer = useCallback(async () => {
    const player = playerRef.current

    if (!player) {
      applyPlaybackError(
        createPlaybackError('Spotify player is not ready yet.'),
        'Spotify player is not ready yet.',
      )
      return false
    }

    try {
      const result = player.activateElement?.()

      if (result && typeof result.then === 'function') {
        await result
      }

      if (deviceIdRef.current) {
        await transferPlaybackToWebPlayer(deviceIdRef.current, false)
      } else {
        await refreshDevices()
      }

      clearPlaybackError()
      return true
    } catch (activationError) {
      applyPlaybackError(
        activationError,
        'Unable to activate Spotify web playback.',
      )
      return false
    }
  }, [
    applyPlaybackError,
    clearPlaybackError,
    refreshDevices,
    transferPlaybackToWebPlayer,
  ])

  useEffect(() => {
    if (!isLocalAuthenticated || !isConnected) {
      disconnectPlayer()
      resetPlaybackState()
      clearPlaybackError()
      return
    }

    if (spotifyProduct && spotifyProduct !== 'premium') {
      disconnectPlayer()
      resetPlaybackState()
      setError('Spotify Premium is required for web playback.')
      setErrorCode('spotify_premium_required')
      return
    }

    let cancelled = false
    let activePlayer = null

    async function initializePlayer() {
      if (playerRef.current) {
        await refreshDevices()
        return
      }

      setIsConnecting(true)

      try {
        await loadSpotifyWebPlaybackSdk()

        if (cancelled || playerRef.current) {
          return
        }

        await fetchSdkToken()

        if (cancelled || playerRef.current) {
          return
        }

        const player = new window.Spotify.Player({
          name: WEB_PLAYER_NAME,
          volume: 0.8,
          getOAuthToken: async (callback) => {
            try {
              const accessToken = await fetchSdkToken()
              callback(accessToken)
            } catch (tokenError) {
              const normalized = mapSpotifyPlaybackError(
                tokenError,
                'Unable to fetch Spotify access token.',
              )
              setError(normalized.message)
              setErrorCode(normalized.code)
            }
          },
        })

        activePlayer = player
        playerRef.current = player

        player.addListener('initialization_error', ({ message }) => {
          applyPlaybackError(
            createPlaybackError(message || 'Spotify player initialization failed.'),
            'Spotify player initialization failed.',
          )
        })
        player.addListener('authentication_error', ({ message }) => {
          applyPlaybackError(
            createPlaybackError(
              message || 'Spotify authentication failed.',
              'spotify_forbidden',
            ),
            'Spotify authentication failed.',
          )
        })
        player.addListener('account_error', ({ message }) => {
          applyPlaybackError(
            createPlaybackError(
              message || 'Spotify Premium is required for web playback.',
              'spotify_premium_required',
            ),
            'Spotify Premium is required for web playback.',
          )
        })
        player.addListener('playback_error', ({ message }) => {
          applyPlaybackError(
            createPlaybackError(message || 'Spotify playback failed.'),
            'Spotify playback failed.',
          )
        })
        player.addListener('player_state_changed', (state) => {
          if (cancelled) {
            return
          }

          setIsActive(Boolean(state))
        })
        player.addListener('ready', ({ device_id: nextDeviceId }) => {
          if (cancelled) {
            return
          }

          setDeviceId(nextDeviceId)
          setIsReady(true)
          clearPlaybackError()
          void transferPlaybackToWebPlayer(nextDeviceId, false).catch(() => {})
        })
        player.addListener('not_ready', ({ device_id: nextDeviceId }) => {
          if (cancelled) {
            return
          }

          if (
            !deviceIdRef.current ||
            deviceIdRef.current === nextDeviceId
          ) {
            setIsActive(false)
            setIsReady(false)
          }
        })

        const connected = await player.connect()

        if (!connected && !cancelled) {
          applyPlaybackError(
            createPlaybackError('Unable to connect Spotify web player.'),
            'Unable to connect Spotify web player.',
          )
        }
      } catch (initializationError) {
        if (!cancelled) {
          applyPlaybackError(
            initializationError,
            'Unable to initialize Spotify web playback.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsConnecting(false)
        }
      }
    }

    initializePlayer()

    return () => {
      cancelled = true

      if (playerRef.current === activePlayer && activePlayer) {
        activePlayer.disconnect()
        playerRef.current = null
      }
    }
  }, [
    applyPlaybackError,
    clearPlaybackError,
    disconnectPlayer,
    fetchSdkToken,
    isConnected,
    isLocalAuthenticated,
    refreshDevices,
    resetPlaybackState,
    spotifyProduct,
    transferPlaybackToWebPlayer,
  ])

  useEffect(() => {
    if (!deviceId || !isConnected || !isLocalAuthenticated) {
      return
    }

    refreshDevices().catch(() => {})
  }, [deviceId, isConnected, isLocalAuthenticated, refreshDevices])

  const value = useMemo(
    () => ({
      activatePlayer,
      deviceId,
      error,
      errorCode,
      isActive,
      isConnecting,
      isReady,
      refreshDevices,
    }),
    [
      activatePlayer,
      deviceId,
      error,
      errorCode,
      isActive,
      isConnecting,
      isReady,
      refreshDevices,
    ],
  )

  return (
    <SpotifyPlaybackContext.Provider value={value}>
      {children}
    </SpotifyPlaybackContext.Provider>
  )
}

export function useSpotifyPlayback() {
  return useContext(SpotifyPlaybackContext)
}
